Place your small ONNX corner detector here as:

  public/models/card-corners.onnx

Expected model contract for the current browser lab:

- One image input tensor in NCHW float32 format
- Shape like [1, 3, 640, 640] or another fixed [1, 3, H, W]
- One float output tensor with at least 8 values
- First 8 output values represent:
  [topLeftX, topLeftY, topRightX, topRightY, bottomRightX, bottomRightY, bottomLeftX, bottomLeftY]
- Output coordinates can be normalized 0..1 or expressed in model input pixels

The scan lab page will:
- capture the framed card area from the camera
- resize it to the model input size
- run inference with onnxruntime-web
- draw the returned corners on top of the image
- show a quick bounding crop preview
