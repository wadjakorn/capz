//! The inference runtime behind the two OpenThai networks.
//!
//! - macOS: `tract` (pure Rust). The prebuilt ONNX Runtime needs macOS 13.4+
//!   and peaked near 3 GB RSS on Apple silicon; capz supports macOS 12.
//! - Windows / Linux: ONNX Runtime through `ort`, statically linked. On x86 it
//!   is ~2.9× faster than tract (CP-0096 perf split).

use anyhow::Result;
use std::path::Path;

pub trait Net {
    /// Run the network on one NCHW f32 input; returns the first output's shape and data.
    fn run(&mut self, shape: [usize; 4], data: Vec<f32>) -> Result<(Vec<usize>, Vec<f32>)>;
}

pub fn load(path: &Path, threads: usize) -> Result<Box<dyn Net>> {
    imp::load(path, threads)
}

#[cfg(not(target_os = "macos"))]
mod imp {
    use super::Net;
    use anyhow::{anyhow, Result};
    use ort::session::builder::GraphOptimizationLevel;
    use ort::session::Session;
    use ort::value::Tensor;
    use std::path::Path;
    use std::sync::{Mutex, OnceLock};

    static ENV: OnceLock<ort::environment::Environment> = OnceLock::new();
    /// ORT allows one environment per process: serialise the first build so
    /// two OCR calls racing on first use don't both try to create it.
    static ENV_INIT: Mutex<()> = Mutex::new(());

    fn env() -> Result<&'static ort::environment::Environment> {
        if let Some(e) = ENV.get() {
            return Ok(e);
        }
        let _guard = ENV_INIT.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(e) = ENV.get() {
            return Ok(e);
        }
        // Telemetry off: capz's privacy policy says nothing leaves the machine unasked.
        let e = ort::init()
            .with_name("capz-ocr")
            .with_telemetry(false)
            .build()
            .map_err(|e| anyhow!("ort init: {e}"))?;
        Ok(ENV.get_or_init(|| e))
    }

    pub fn load(path: &Path, threads: usize) -> Result<Box<dyn Net>> {
        let env = env()?;
        // No CPU memory arena / memory pattern: peak RSS 560 → 223 MB on the
        // CP-0096 perf split for ~5% more time.
        let s = Session::builder(env)
            .map_err(|e| anyhow!("{e}"))?
            .with_execution_providers([ort::ep::CPU::default().with_arena_allocator(false).build()])
            .map_err(|e| anyhow!("{e}"))?
            .with_memory_pattern(false)
            .map_err(|e| anyhow!("{e}"))?
            .with_optimization_level(GraphOptimizationLevel::Level3)
            .map_err(|e| anyhow!("{e}"))?
            .with_intra_threads(threads)
            .map_err(|e| anyhow!("{e}"))?
            .with_inter_threads(1)
            .map_err(|e| anyhow!("{e}"))?
            .with_config_entry("session.intra_op.allow_spinning", "0")
            .map_err(|e| anyhow!("{e}"))?
            .commit_from_file(path)
            .map_err(|e| anyhow!("load {}: {e}", path.display()))?;
        Ok(Box::new(OrtNet(s)))
    }

    struct OrtNet(Session);

    impl Net for OrtNet {
        fn run(&mut self, shape: [usize; 4], data: Vec<f32>) -> Result<(Vec<usize>, Vec<f32>)> {
            let t = Tensor::from_array((shape, data)).map_err(|e| anyhow!("{e}"))?;
            let out = self.0.run(ort::inputs![t]).map_err(|e| anyhow!("{e}"))?;
            let (shp, d) = out[0].try_extract_tensor::<f32>().map_err(|e| anyhow!("{e}"))?;
            Ok((shp.iter().map(|&x| x as usize).collect(), d.to_vec()))
        }
    }
}

#[cfg(target_os = "macos")]
mod imp {
    use super::Net;
    use anyhow::Result;
    use std::collections::HashMap;
    use std::path::Path;
    use std::sync::Arc;
    use tract_onnx::prelude::*;

    pub fn load(path: &Path, _threads: usize) -> Result<Box<dyn Net>> {
        // The paddle2onnx export declares symbolic intermediate shapes tract cannot unify.
        let onnx = tract_onnx::onnx()
            .with_ignore_value_info(true)
            .with_ignore_output_shapes(true);
        Ok(Box::new(TractNet { model: onnx.model_for_path(path)?, plans: HashMap::new() }))
    }

    /// tract cannot type det.onnx with symbolic H/W, so each concrete input
    /// shape gets its own optimised plan, cached for the life of one OCR call.
    struct TractNet {
        model: InferenceModel,
        plans: HashMap<[usize; 4], Arc<TypedSimplePlan>>,
    }

    impl Net for TractNet {
        fn run(&mut self, shape: [usize; 4], data: Vec<f32>) -> Result<(Vec<usize>, Vec<f32>)> {
            if !self.plans.contains_key(&shape) {
                let plan = self
                    .model
                    .clone()
                    .with_input_fact(0, f32::fact(shape).into())?
                    .into_optimized()?
                    .into_runnable()?;
                self.plans.insert(shape, plan);
            }
            let t = Tensor::from_shape(&shape, &data)?;
            let out = self.plans[&shape].run(tvec!(t.into()))?;
            let v = out[0].to_plain_array_view::<f32>()?;
            Ok((v.shape().to_vec(), v.iter().copied().collect()))
        }
    }
}
