//! The two inference runtimes under test: ONNX Runtime through `ort`
//! (prebuilt static library) and `tract` (pure Rust, no native library).

use anyhow::{anyhow, Result};
use std::path::Path;

pub trait Net {
    /// Run the network on one NCHW f32 input; returns the first output's shape and data.
    fn run(&mut self, shape: [usize; 4], data: Vec<f32>) -> Result<(Vec<usize>, Vec<f32>)>;
}

pub fn load(backend: &str, path: &Path, threads: usize) -> Result<Box<dyn Net>> {
    match backend {
        #[cfg(feature = "backend-ort")]
        "ort" => Ok(Box::new(ort_net::OrtNet::load(path, threads)?)),
        #[cfg(feature = "backend-tract")]
        "tract" => Ok(Box::new(tract_net::TractNet::load(path)?)),
        other => {
            let _ = (path, threads);
            Err(anyhow!("backend {other:?} not compiled in (features: backend-ort, backend-tract)"))
        }
    }
}

#[cfg(feature = "backend-ort")]
mod ort_net {
    use super::Net;
    use anyhow::{anyhow, Result};
    use ort::session::builder::GraphOptimizationLevel;
    use ort::session::Session;
    use ort::value::Tensor;
    use std::path::Path;
    use std::sync::OnceLock;

    static ENV: OnceLock<ort::environment::Environment> = OnceLock::new();

    pub struct OrtNet(Session);

    impl OrtNet {
        pub fn load(path: &Path, threads: usize) -> Result<Self> {
            let env = match ENV.get() {
                Some(e) => e,
                None => {
                    // telemetry off: capz's privacy policy says nothing leaves the machine unasked
                    let e = ort::init().with_name("openthai").with_telemetry(false).build()
                        .map_err(|e| anyhow!("ort init: {e}"))?;
                    ENV.get_or_init(|| e)
                }
            };
            let s = Session::builder(env)
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
                .map_err(|e| anyhow!("{e}"))?;
            Ok(OrtNet(s))
        }
    }

    impl Net for OrtNet {
        fn run(&mut self, shape: [usize; 4], data: Vec<f32>) -> Result<(Vec<usize>, Vec<f32>)> {
            let t = Tensor::from_array((shape, data)).map_err(|e| anyhow!("{e}"))?;
            let out = self.0.run(ort::inputs![t]).map_err(|e| anyhow!("{e}"))?;
            let (shp, d) = out[0].try_extract_tensor::<f32>().map_err(|e| anyhow!("{e}"))?;
            Ok((shp.iter().map(|&x| x as usize).collect(), d.to_vec()))
        }
    }
}

#[cfg(feature = "backend-tract")]
mod tract_net {
    use super::Net;
    use anyhow::Result;
    use std::path::Path;
    use tract_onnx::prelude::*;

    pub struct TractNet(std::sync::Arc<TypedSimplePlan>);

    impl TractNet {
        pub fn load(path: &Path) -> Result<Self> {
            let plan = tract_onnx::onnx().model_for_path(path)?.into_optimized()?.into_runnable()?;
            Ok(TractNet(plan))
        }
    }

    impl Net for TractNet {
        fn run(&mut self, shape: [usize; 4], data: Vec<f32>) -> Result<(Vec<usize>, Vec<f32>)> {
            let t = Tensor::from_shape(&shape, &data)?;
            let out = self.0.run(tvec!(t.into()))?;
            let v = out[0].to_plain_array_view::<f32>()?;
            Ok((v.shape().to_vec(), v.iter().copied().collect()))
        }
    }
}
