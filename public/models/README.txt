The app now ships with a free default model at:

  public/models/card-corners.onnx

Current default:

- UVDoc remap-grid ONNX from Hugging Face, merged into a single-file ONNX for browser use
- Input tensor: NCHW float32
- Input shape: [1, 3, 720, 496]
- Output tensor: [1, 2, 45, 31]
- Output values are normalized source coordinates used to unwarp the document

Source files kept in this folder:
- `UVDoc_grid.onnx`
- `UVDoc_grid.onnx.data`

Bundled browser-safe file:
- `card-corners.onnx`
- this is the merged single-file model the app loads by default

The scan lab page will:
- capture the framed card area from the camera
- resize it to the model input size
- run inference with onnxruntime-web
- derive four source corners from the grid edges
- draw the returned corners on top of the image
- show an unwarped preview

You can still replace the default model with a local `.onnx` file. The lab also supports a simpler
corner-point output model if it returns the first 8 values as:

  [topLeftX, topLeftY, topRightX, topRightY, bottomRightX, bottomRightY, bottomLeftX, bottomLeftY]
