declare global {
  interface Window {
    cv?: {
      Mat?: unknown;
      [key: string]: unknown;
    };
  }
}

const OPENCV_SCRIPT_ID = "opencv-js-runtime";
const OPENCV_SCRIPT_SRC = "https://docs.opencv.org/4.x/opencv.js";

let openCvPromise: Promise<typeof window.cv> | null = null;

function waitForOpenCv(timeoutMs: number): Promise<typeof window.cv> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const check = () => {
      if (window.cv?.Mat) {
        resolve(window.cv);
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error("OpenCV.js did not finish loading in time."));
        return;
      }

      window.setTimeout(check, 50);
    };

    check();
  });
}

export async function loadOpenCv(): Promise<typeof window.cv> {
  if (typeof window === "undefined") {
    throw new Error("OpenCV.js can only be loaded in the browser.");
  }

  if (window.cv?.Mat) {
    return window.cv;
  }

  if (!openCvPromise) {
    openCvPromise = new Promise<typeof window.cv>((resolve, reject) => {
      const existingScript = document.getElementById(OPENCV_SCRIPT_ID) as HTMLScriptElement | null;

      const finish = () => {
        void waitForOpenCv(2500).then(resolve).catch(reject);
      };

      if (existingScript) {
        finish();
        return;
      }

      const script = document.createElement("script");
      script.id = OPENCV_SCRIPT_ID;
      script.async = true;
      script.src = OPENCV_SCRIPT_SRC;
      script.onerror = () => reject(new Error("Failed to load OpenCV.js."));
      script.onload = finish;
      document.head.appendChild(script);
    });
  }

  return openCvPromise;
}
