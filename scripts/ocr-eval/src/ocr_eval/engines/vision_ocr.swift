// Apple Vision text recognition with the settings capz uses
// (src-tauri/src/services/ocr/macos.rs). Usage: vision_ocr <png>...
// One JSON object per image on stdout; boxes in image pixels, origin top-left.
import Foundation
import ImageIO
import Vision

func esc(_ s: String) -> String {
    let d = try! JSONSerialization.data(withJSONObject: [s], options: [])
    let a = String(data: d, encoding: .utf8)!
    return String(a.dropFirst().dropLast())
}

for path in CommandLine.arguments.dropFirst() {
    let url = URL(fileURLWithPath: path)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
        FileHandle.standardError.write("cannot read \(path)\n".data(using: .utf8)!)
        exit(1)
    }
    let W = Double(img.width), H = Double(img.height)
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = true
    req.automaticallyDetectsLanguage = true
    req.recognitionLanguages = ["en-US", "th-TH"]
    let t0 = Date()
    let handler = VNImageRequestHandler(cgImage: img, options: [:])
    try! handler.perform([req])
    let ms = Date().timeIntervalSince(t0) * 1000
    var lines: [String] = []
    for obs in req.results ?? [] {
        guard let top = obs.topCandidates(1).first else { continue }
        let b = obs.boundingBox
        let x = b.minX * W, y = (1.0 - b.maxY) * H, w = b.width * W, h = b.height * H
        lines.append("{\"text\":\(esc(top.string)),\"conf\":\(top.confidence),\"box\":[\(x),\(y),\(w),\(h)]}")
    }
    let id = url.deletingPathExtension().lastPathComponent
    print("{\"id\":\(esc(id)),\"width\":\(Int(W)),\"height\":\(Int(H)),\"elapsed_ms\":\(ms),\"lines\":[\(lines.joined(separator: ","))]}")
}
