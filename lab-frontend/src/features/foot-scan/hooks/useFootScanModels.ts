import { useEffect, useRef, useState } from "react";

type ModelStatus = "idle" | "loading" | "ready" | "error";

export const useFootScanModels = () => {
  const [status, setStatus] = useState<ModelStatus>("idle");
  const segmenterRef = useRef<any>(null);
  const detectorRef = useRef<any>(null);

  useEffect(() => {
    let active = true;
    const loadModels = async () => {
      setStatus("loading");
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const { FilesetResolver, ImageSegmenter, ObjectDetector } = vision;

        const fileset = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm"
        );

        const segmenter = await ImageSegmenter.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite",
          },
          outputCategoryMask: true,
        });

        let detector = null;
        const detectorModel = process.env.NEXT_PUBLIC_A4_DETECT_MODEL_URL;
        if (detectorModel) {
          detector = await ObjectDetector.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: detectorModel },
            scoreThreshold: 0.4,
          });
        }

        if (!active) {
          segmenter.close();
          detector?.close();
          return;
        }

        segmenterRef.current = segmenter;
        detectorRef.current = detector;
        setStatus("ready");
      } catch (error) {
        if (active) {
          console.error("Model load failed", error);
          setStatus("error");
        }
      }
    };

    loadModels();
    return () => {
      active = false;
      segmenterRef.current?.close?.();
      detectorRef.current?.close?.();
    };
  }, []);

  return {
    status,
    segmenter: segmenterRef.current,
    detector: detectorRef.current,
  };
};
