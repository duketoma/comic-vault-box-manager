import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Upload,
  RotateCcw,
  RotateCw,
  Maximize2,
  ScanLine,
  Download,
  Check,
  RefreshCw,
  Loader2,
  Sliders,
  Crop,
  Video,
  X,
  Barcode,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { ComicBook, SeriesIssueTotal } from '../types';
import {
  QuadCorners,
  AspectRatioPreset,
  DEFAULT_FULL_QUAD,
  createRotatedSourceCanvas,
  detectComicCoverQuad,
  warpPerspectiveCanvas,
  buildCoverDownloadFilename,
} from '../utils/perspectiveWarpUtils';
import { recognizeComicCoverCanvas, CoverOcrResult } from '../utils/coverOcrService';
import { getComicCoverUrl, formatDriveImageUrl, isComicAlreadyLinked } from '../utils/imageUtils';
import { buildApiUrl } from '../services/apiConfig';
import { capturePhotoNative, scanBarcodeNative, isNativeMobile } from '../utils/nativeHardware';

export interface CoverScannerCropperProps {
  /** Whether to run OCR for Title & Issue # detection when applying crop */
  enableOcr?: boolean;
  /** Default aspect ratio preset ('standard' for front covers, 'wraparound' for full spread) */
  defaultPreset?: AspectRatioPreset;
  /** Existing cover image URL (for re-cropping an existing comic's image) */
  initialImageUrl?: string;
  /** Current comic title (used for download filename and UI context) */
  comicTitle?: string;
  /** Current comic issue number (used for download filename and UI context) */
  comicIssueNumber?: string;
  /** Existing comics in collection (for OCR catalog series cross-referencing) */
  existingComics?: ComicBook[];
  /** Series totals (for OCR catalog series cross-referencing) */
  seriesTotals?: SeriesIssueTotal[];
  /** Called when the cropped/warped image is finalized (and optional OCR results are ready) */
  onApplyImage: (croppedDataUrl: string, ocrResult?: CoverOcrResult) => void;
  /** Called if the user clicks a candidate title or issue chip after OCR */
  onSelectOcrCandidate?: (field: 'title' | 'issueNumber' | 'publisher', value: string) => void;
  /** Optional native barcode scan handler */
  onBarcodeScanned?: (barcode: string) => void;
  /** Optional cancel button handler (when rendered inside a standalone modal) */
  onCancel?: () => void;
  /** Label for the primary apply button */
  applyButtonLabel?: string;
}

const CORNER_LABELS = ['TL', 'TR', 'BR', 'BL'] as const;

export const CoverScannerCropper: React.FC<CoverScannerCropperProps> = ({
  enableOcr = true,
  defaultPreset = 'standard',
  initialImageUrl,
  comicTitle,
  comicIssueNumber,
  existingComics = [],
  seriesTotals = [],
  onApplyImage,
  onSelectOcrCandidate,
  onBarcodeScanned,
  onCancel,
  applyButtonLabel,
}) => {
  // Loaded HTMLImageElement
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [isLoadingSource, setIsLoadingSource] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Transform & Crop State
  const [rotation90, setRotation90] = useState<number>(0);
  const [deskewDegrees, setDeskewDegrees] = useState<number>(0);
  const [aspectPreset, setAspectPreset] = useState<AspectRatioPreset>(defaultPreset);
  const [quad, setQuad] = useState<QuadCorners>(() =>
    DEFAULT_FULL_QUAD.map((p) => ({ ...p })) as QuadCorners
  );

  // Active dragged corner index (0..3) for pointer interaction and magnifier loupe
  const [activeCornerIdx, setActiveCornerIdx] = useState<number | null>(null);

  // Rotated source canvas and warped output preview
  const rotatedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rotatedPreviewUrl, setRotatedPreviewUrl] = useState<string | null>(null);
  const [warpedPreviewUrl, setWarpedPreviewUrl] = useState<string | null>(null);
  const [warpedDimensions, setWarpedDimensions] = useState<{ width: number; height: number } | null>(null);

  // Interactive crop container ref & magnifier canvas ref
  const cropContainerRef = useRef<HTMLDivElement | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Live Desktop Webcam State
  const [isWebcamOpen, setIsWebcamOpen] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>('');
  const [activeResolution, setActiveResolution] = useState<string>('');
  const [isSwitchingCamera, setIsSwitchingCamera] = useState<boolean>(false);
  const activeDeviceIdRef = useRef<string>('');

  // OCR State
  const [isRunningOcr, setIsRunningOcr] = useState<boolean>(false);
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [ocrStatusText, setOcrStatusText] = useState<string>('');
  const [ocrResult, setOcrResult] = useState<CoverOcrResult | null>(null);

  // Stop webcam stream on unmount
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    };
  }, []);

  // Load an image from a data URL or web URL (using proxy if external)
  const loadSourceFromUrl = useCallback(
    (rawUrl: string) => {
      if (!rawUrl) return;
      setIsLoadingSource(true);
      setLoadError(null);
      setOcrResult(null);

      let resolvedUrl = rawUrl;
      if (!rawUrl.startsWith('data:') && !rawUrl.startsWith('blob:')) {
        const formatted = formatDriveImageUrl(rawUrl);
        if (formatted.startsWith('http://') || formatted.startsWith('https://')) {
          resolvedUrl = buildApiUrl(`/api/proxy-image?url=${encodeURIComponent(formatted)}`);
        } else {
          resolvedUrl = formatted;
        }
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        setSourceImage(img);
        setRotation90(0);
        setDeskewDegrees(0);
        const rotCanvas = createRotatedSourceCanvas(img, 0);
        rotatedCanvasRef.current = rotCanvas;
        setRotatedPreviewUrl(rotCanvas.toDataURL('image/jpeg', 0.85));
        const detected = detectComicCoverQuad(rotCanvas);
        setQuad(detected);
        setIsLoadingSource(false);
      };
      img.onerror = () => {
        setIsLoadingSource(false);
        setLoadError('Unable to load image for cropping. Please upload a local file or take a photo.');
      };
      img.src = resolvedUrl;
    },
    []
  );

  // Recompute rotated source canvas when rotation90 or sourceImage changes
  useEffect(() => {
    if (!sourceImage) return;
    const rotCanvas = createRotatedSourceCanvas(sourceImage, rotation90);
    rotatedCanvasRef.current = rotCanvas;
    setRotatedPreviewUrl(rotCanvas.toDataURL('image/jpeg', 0.85));
  }, [sourceImage, rotation90]);

  // Recompute warped preview whenever quad, deskewDegrees, aspectPreset, or rotatedPreviewUrl changes
  useEffect(() => {
    const rotCanvas = rotatedCanvasRef.current;
    if (!rotCanvas || !sourceImage) return;

    // During active corner dragging, use a fast preview resolution (480px); otherwise full 1000px
    const maxDim = activeCornerIdx !== null ? 480 : 1000;
    const warpedCanvas = warpPerspectiveCanvas(
      rotCanvas,
      quad,
      aspectPreset,
      deskewDegrees,
      maxDim
    );
    setWarpedDimensions({ width: warpedCanvas.width, height: warpedCanvas.height });
    setWarpedPreviewUrl(warpedCanvas.toDataURL('image/jpeg', 0.82));
  }, [quad, deskewDegrees, aspectPreset, rotatedPreviewUrl, activeCornerIdx, sourceImage]);

  // Draw Magnifier Loupe when dragging a corner
  useEffect(() => {
    if (activeCornerIdx === null || !loupeCanvasRef.current || !rotatedCanvasRef.current) return;
    const loupe = loupeCanvasRef.current;
    const ctx = loupe.getContext('2d');
    const src = rotatedCanvasRef.current;
    if (!ctx) return;

    const corner = quad[activeCornerIdx];
    const cx = corner.x * src.width;
    const cy = corner.y * src.height;
    const radiusPx = Math.max(24, Math.round(Math.min(src.width, src.height) * 0.06));

    ctx.clearRect(0, 0, loupe.width, loupe.height);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, loupe.width, loupe.height);

    ctx.drawImage(
      src,
      cx - radiusPx,
      cy - radiusPx,
      radiusPx * 2,
      radiusPx * 2,
      0,
      0,
      loupe.width,
      loupe.height
    );

    // Crosshair inside loupe
    const mid = loupe.width / 2;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mid, 0);
    ctx.lineTo(mid, loupe.height);
    ctx.moveTo(0, mid);
    ctx.lineTo(loupe.width, mid);
    ctx.stroke();
  }, [activeCornerIdx, quad]);

  // Handle File Upload
  const handleFileSelect = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        loadSourceFromUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // ---- Webcam camera selection helpers ----
  const CAMERA_PREF_ID_KEY = 'comic_vault_preferred_camera_id';
  const CAMERA_PREF_LABEL_KEY = 'comic_vault_preferred_camera_label';

  const stopActiveStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  /** Lists video input devices. Labels are only populated after camera permission is granted. */
  const refreshVideoDevices = useCallback(async (): Promise<MediaDeviceInfo[]> => {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all.filter((d) => d.kind === 'videoinput');
      setVideoDevices(cams);
      return cams;
    } catch {
      return [];
    }
  }, []);

  /** Resolves the saved preferred camera (by deviceId, then by label since IDs can rotate). */
  const resolvePreferredDeviceId = (cams: MediaDeviceInfo[]): string | undefined => {
    const savedId = localStorage.getItem(CAMERA_PREF_ID_KEY) || '';
    const savedLabel = localStorage.getItem(CAMERA_PREF_LABEL_KEY) || '';
    if (savedId && cams.some((c) => c.deviceId === savedId)) return savedId;
    if (savedLabel) {
      const byLabel = cams.find((c) => c.label === savedLabel);
      if (byLabel) return byLabel.deviceId;
    }
    return undefined;
  };

  /**
   * Opens a camera stream. When a deviceId is given, it is requested with `exact` so Windows
   * cannot silently substitute the default camera. Requests up to 4K; the camera returns its max.
   */
  const openCameraStream = async (deviceId?: string): Promise<MediaStream> => {
    const resolutionConstraints = {
      width: { ideal: 3840 },
      height: { ideal: 2160 },
    };
    if (deviceId) {
      return navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, ...resolutionConstraints },
        audio: false,
      });
    }
    return navigator.mediaDevices.getUserMedia({
      video: resolutionConstraints,
      audio: false,
    });
  };

  const attachStream = (stream: MediaStream) => {
    mediaStreamRef.current = stream;
    const track = stream.getVideoTracks()[0];
    const settings = track?.getSettings() || {};
    const usedId = settings.deviceId || '';
    activeDeviceIdRef.current = usedId;
    setActiveDeviceId(usedId);
    setActiveResolution(settings.width && settings.height ? `${settings.width}×${settings.height}` : '');

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }

    // If the camera disconnects (e.g. Iriun app closed), clear the feed
    if (track) {
      track.onended = () => {
        if (mediaStreamRef.current === stream) {
          setActiveResolution('');
          setLoadError('The selected camera disconnected. Choose another camera or reconnect it.');
        }
      };
    }
  };

  /** Switches to a specific camera (or the best available) and persists the choice. */
  const switchToCamera = async (deviceId?: string, persist: boolean = true) => {
    setIsSwitchingCamera(true);
    setLoadError(null);
    stopActiveStream();
    try {
      let stream: MediaStream;
      try {
        stream = await openCameraStream(deviceId);
      } catch (err: any) {
        // Saved/selected camera unavailable — fall back to system default
        if (deviceId && (err?.name === 'OverconstrainedError' || err?.name === 'NotFoundError')) {
          stream = await openCameraStream(undefined);
        } else {
          throw err;
        }
      }
      attachStream(stream);

      // Labels become available after permission; refresh list now
      const cams = await refreshVideoDevices();
      if (persist) {
        const usedId = stream.getVideoTracks()[0]?.getSettings().deviceId || '';
        const usedCam = cams.find((c) => c.deviceId === usedId);
        if (usedId) localStorage.setItem(CAMERA_PREF_ID_KEY, usedId);
        if (usedCam?.label) localStorage.setItem(CAMERA_PREF_LABEL_KEY, usedCam.label);
      }
    } catch (err: any) {
      const name = err?.name || '';
      setLoadError(
        name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser site settings and try again.'
          : name === 'NotReadableError'
          ? 'This camera is in use by another application (e.g. Windows Camera). Close it and try again, or pick another camera.'
          : err?.message || 'Could not access webcam. Please check camera permissions or upload a file.'
      );
    } finally {
      setIsSwitchingCamera(false);
    }
  };

  // Start Desktop Webcam (uses remembered camera when available)
  const handleStartWebcam = async () => {
    setLoadError(null);
    setIsWebcamOpen(true);
    // Before permission, enumerateDevices may hide labels/IDs; try saved ID first anyway
    const cams = await refreshVideoDevices();
    const preferred = resolvePreferredDeviceId(cams) || localStorage.getItem(CAMERA_PREF_ID_KEY) || undefined;
    await switchToCamera(preferred, false);

    // After permission, labels are known — re-resolve by label in case the ID rotated
    const camsAfter = await refreshVideoDevices();
    const preferredAfter = resolvePreferredDeviceId(camsAfter);
    if (preferredAfter && preferredAfter !== activeDeviceIdRef.current) {
      await switchToCamera(preferredAfter, false);
    }
  };

  const handleSelectCamera = (deviceId: string) => {
    if (!deviceId || deviceId === activeDeviceIdRef.current) return;
    switchToCamera(deviceId, true);
  };

  // Hot-plug: refresh camera list when devices connect/disconnect while the webcam view is open
  useEffect(() => {
    if (!isWebcamOpen || !navigator.mediaDevices?.addEventListener) return;
    const handleDeviceChange = async () => {
      const cams = await refreshVideoDevices();
      const activeStillPresent = cams.some((c) => c.deviceId === activeDeviceIdRef.current);
      const preferred = resolvePreferredDeviceId(cams);
      // Auto-switch to the remembered camera when it (re)appears, e.g. Iriun connects
      if (preferred && preferred !== activeDeviceIdRef.current) {
        switchToCamera(preferred, false);
      } else if (!activeStillPresent && cams.length > 0) {
        switchToCamera(cams[0].deviceId, false);
      }
    };
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWebcamOpen, refreshVideoDevices]);

  // Attach stream once the <video> element mounts
  useEffect(() => {
    if (isWebcamOpen && videoRef.current && mediaStreamRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = mediaStreamRef.current;
      videoRef.current.play().catch(() => {});
    }
  });

  const handleStopWebcam = () => {
    stopActiveStream();
    setIsWebcamOpen(false);
    setActiveResolution('');
  };

  const handleSnapWebcamPhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    // Cap the long edge at 3000px so 4K frames stay responsive in the perspective editor
    const maxEdge = 3000;
    const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      handleStopWebcam();
      loadSourceFromUrl(dataUrl);
    }
  };

  const handleNativeCameraCapture = async () => {
    const photo = await capturePhotoNative();
    if (photo) {
      loadSourceFromUrl(photo);
    }
  };

  const handleNativeBarcodeScan = async () => {
    const barcode = await scanBarcodeNative();
    if (barcode && onBarcodeScanned) {
      onBarcodeScanned(barcode);
    }
  };

  // Pointer dragging for the 4 quad corners
  const updateCornerFromPointer = useCallback(
    (clientX: number, clientY: number, cornerIdx: number) => {
      const container = cropContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const nx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const ny = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

      setQuad((prev) => {
        const next = prev.map((p) => ({ ...p })) as QuadCorners;
        next[cornerIdx] = { x: nx, y: ny };
        return next;
      });
    },
    []
  );

  useEffect(() => {
    if (activeCornerIdx === null) return;

    const handlePointerMove = (e: PointerEvent) => {
      e.preventDefault();
      updateCornerFromPointer(e.clientX, e.clientY, activeCornerIdx);
    };

    const handlePointerUp = () => {
      setActiveCornerIdx(null);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [activeCornerIdx, updateCornerFromPointer]);

  // Rotate 90 degrees left/right and rotate the normalized quad coordinates accordingly
  const handleRotate90 = (deltaDegrees: -90 | 90) => {
    setRotation90((prev) => ((prev + deltaDegrees) % 360 + 360) % 360);
    setQuad((prev) => {
      if (deltaDegrees === 90) {
        // (x, y) -> (1 - y, x) and cycle corner order [BL, TL, TR, BR]
        const mapped = prev.map((p) => ({ x: 1 - p.y, y: p.x }));
        return [mapped[3], mapped[0], mapped[1], mapped[2]] as QuadCorners;
      } else {
        // (x, y) -> (y, 1 - x) and cycle corner order [TR, BR, BL, TL]
        const mapped = prev.map((p) => ({ x: p.y, y: 1 - p.x }));
        return [mapped[1], mapped[2], mapped[3], mapped[0]] as QuadCorners;
      }
    });
  };

  const handleAutoDetectQuad = () => {
    if (!rotatedCanvasRef.current) return;
    const detected = detectComicCoverQuad(rotatedCanvasRef.current);
    setQuad(detected);
  };

  const handleResetFullQuad = () => {
    setQuad(DEFAULT_FULL_QUAD.map((p) => ({ ...p })) as QuadCorners);
    setDeskewDegrees(0);
  };

  // Generate final full-resolution (1000px) warped canvas & JPEG data URL
  const generateFinalWarpedOutput = (): {
    canvas: HTMLCanvasElement;
    dataUrl: string;
  } | null => {
    const rotCanvas = rotatedCanvasRef.current;
    if (!rotCanvas) return null;
    const canvas = warpPerspectiveCanvas(rotCanvas, quad, aspectPreset, deskewDegrees, 1000);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    return { canvas, dataUrl };
  };

  // Run OCR explicitly or as part of applying crop
  const handleRunOcr = async (applyAfterOcr: boolean = false) => {
    const output = generateFinalWarpedOutput();
    if (!output) return;

    setIsRunningOcr(true);
    setOcrProgress(5);
    setOcrStatusText('Preparing cropped cover for OCR...');

    try {
      const result = await recognizeComicCoverCanvas(
        output.canvas,
        existingComics,
        seriesTotals,
        (pct, status) => {
          setOcrProgress(pct);
          setOcrStatusText(status);
        }
      );
      setOcrResult(result);
      if (applyAfterOcr) {
        onApplyImage(output.dataUrl, result);
      }
    } catch (err: any) {
      console.error('Cover OCR error:', err);
      setLoadError(err?.message || 'OCR text detection failed, but cropped image was saved.');
      if (applyAfterOcr) {
        onApplyImage(output.dataUrl);
      }
    } finally {
      setIsRunningOcr(false);
    }
  };

  // Primary Apply Action
  const handleApplyCrop = async () => {
    const output = generateFinalWarpedOutput();
    if (!output) return;

    if (enableOcr && !ocrResult) {
      await handleRunOcr(true);
    } else {
      onApplyImage(output.dataUrl, ocrResult || undefined);
    }
  };

  // Download Warped Cover as `<Title> #<Issue>.jpg` or `<Title> Full #<Issue>.jpg`
  const handleDownloadCroppedImage = () => {
    const output = generateFinalWarpedOutput();
    if (!output) return;

    const effectiveTitle = ocrResult?.title || comicTitle || 'Comic Cover';
    const effectiveIssue = ocrResult?.issueNumber || comicIssueNumber || '1';
    const isFull = aspectPreset === 'wraparound';
    const filename = buildCoverDownloadFilename(effectiveTitle, effectiveIssue, isFull);

    const link = document.createElement('a');
    link.href = output.dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasValidExistingImage =
    Boolean(initialImageUrl) && isComicAlreadyLinked(initialImageUrl);

  return (
    <div className="space-y-4 text-left">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          handleFileSelect(e.target.files?.[0]);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Live Desktop Webcam Modal / View */}
      {isWebcamOpen && (
        <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-3 border border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold flex items-center gap-1.5">
              <Video className="w-4 h-4 text-emerald-400 animate-pulse" />
              Live Camera Capture — Align comic cover within view
            </span>
            <button
              type="button"
              onClick={handleStopWebcam}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Camera Picker */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label htmlFor="cover-scanner-camera-select" className="font-semibold text-slate-300 shrink-0">
              Camera:
            </label>
            <select
              id="cover-scanner-camera-select"
              value={activeDeviceId}
              onChange={(e) => handleSelectCamera(e.target.value)}
              disabled={isSwitchingCamera || videoDevices.length === 0}
              className="flex-1 min-w-[180px] bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 disabled:opacity-60 cursor-pointer"
            >
              {videoDevices.length === 0 && <option value="">Detecting cameras...</option>}
              {activeDeviceId && !videoDevices.some((d) => d.deviceId === activeDeviceId) && (
                <option value={activeDeviceId}>Current camera</option>
              )}
              {videoDevices.map((d, idx) => (
                <option key={d.deviceId || idx} value={d.deviceId}>
                  {d.label || `Camera ${idx + 1}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => refreshVideoDevices()}
              disabled={isSwitchingCamera}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 cursor-pointer disabled:opacity-50"
              title="Refresh camera list"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSwitchingCamera ? 'animate-spin' : ''}`} />
            </button>
            {activeResolution && (
              <span className="px-2 py-1 rounded-md bg-emerald-950/70 border border-emerald-800 text-emerald-300 font-mono text-[10px] font-bold">
                {activeResolution}
              </span>
            )}
          </div>

          <div className="relative rounded-xl overflow-hidden bg-black max-h-80 min-h-40 flex items-center justify-center">
            {isSwitchingCamera && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-300 gap-2 z-10">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Connecting to camera...</span>
              </div>
            )}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="max-h-80 w-auto object-contain"
            />
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleSnapWebcamPhoto}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Snap Cover Photo</span>
            </button>
            <button
              type="button"
              onClick={handleStopWebcam}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Initial Empty / Upload State when no image is loaded */}
      {!sourceImage && !isWebcamOpen && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handleFileSelect(file);
          }}
          className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-2xl p-6 sm:p-8 bg-slate-50/60 dark:bg-slate-800/30 text-center space-y-4 transition-colors"
        >
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
            {isLoadingSource ? (
              <Loader2 className="w-7 h-7 animate-spin" />
            ) : (
              <Crop className="w-7 h-7" />
            )}
          </div>

          <div className="max-w-md mx-auto">
            <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
              Perspective Cover Cropper, Deskew & Local OCR
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Upload or snap a comic cover photo to warp-crop 4 corners, straighten tilt, and{' '}
              {enableOcr
                ? 'detect Title & Issue # on-device with zero AI cost.'
                : 'save a clean, flattened cover image.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Choose Image File</span>
            </button>

            {isNativeMobile() ? (
              <button
                type="button"
                onClick={handleNativeCameraCapture}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Take Photo</span>
              </button>
            ) : (
              typeof navigator !== 'undefined' &&
              navigator.mediaDevices && (
                <button
                  type="button"
                  onClick={handleStartWebcam}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Video className="w-4 h-4" />
                  <span>Use Webcam</span>
                </button>
              )
            )}

            {hasValidExistingImage && initialImageUrl && (
              <button
                type="button"
                onClick={() => loadSourceFromUrl(getComicCoverUrl(initialImageUrl))}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Crop / Deskew Current Cover</span>
              </button>
            )}

            {isNativeMobile() && onBarcodeScanned && (
              <button
                type="button"
                onClick={handleNativeBarcodeScan}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Barcode className="w-4 h-4" />
                <span>Scan Barcode / UPC</span>
              </button>
            )}
          </div>
        </div>
      )}

      {loadError && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs rounded-xl">
          {loadError}
        </div>
      )}

      {/* Active Perspective Warp & Deskew Editor */}
      {sourceImage && rotatedPreviewUrl && (
        <div className="space-y-4">
          {/* Top Controls Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleAutoDetectQuad}
                className="px-2.5 py-1.5 bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg font-semibold flex items-center gap-1 cursor-pointer"
                title="Automatically detect comic cover corners"
              >
                <ScanLine className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Auto-Edges</span>
              </button>

              <button
                type="button"
                onClick={handleResetFullQuad}
                className="px-2.5 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg font-semibold flex items-center gap-1 cursor-pointer"
                title="Reset corners to full image bounds"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Full Frame</span>
              </button>

              <button
                type="button"
                onClick={() => handleRotate90(-90)}
                className="p-1.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg cursor-pointer"
                title="Rotate 90° Counter-Clockwise"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => handleRotate90(90)}
                className="p-1.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg cursor-pointer"
                title="Rotate 90° Clockwise"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Aspect Ratio Selector */}
            <div className="flex items-center gap-1 bg-slate-200/80 dark:bg-slate-900 p-0.5 rounded-lg">
              {(
                [
                  { id: 'standard', label: 'Cover (2:3)' },
                  { id: 'wraparound', label: 'Spread (4:3)' },
                  { id: 'freeform', label: 'Freeform' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setAspectPreset(preset.id)}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                    aspectPreset === preset.id
                      ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Replace Image Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Change Photo</span>
            </button>
          </div>

          {/* Fine Deskew Angle Slider */}
          <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 shrink-0">
              <Sliders className="w-3.5 h-3.5 text-indigo-500" />
              <span>Fine Deskew Angle:</span>
            </span>
            <input
              type="range"
              min={-15}
              max={15}
              step={0.25}
              value={deskewDegrees}
              onChange={(e) => setDeskewDegrees(parseFloat(e.target.value))}
              className="flex-1 accent-indigo-600 cursor-pointer"
            />
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100 w-12 text-right">
              {deskewDegrees > 0 ? `+${deskewDegrees.toFixed(1)}°` : `${deskewDegrees.toFixed(1)}°`}
            </span>
            {Math.abs(deskewDegrees) > 0.01 && (
              <button
                type="button"
                onClick={() => setDeskewDegrees(0)}
                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>

          {/* Main Interactive 4-Corner Perspective Editor + Warped Preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {/* Left: Source Image with Draggable 4-Point Perspective Quad */}
            <div className="bg-slate-900 rounded-2xl p-3 border border-slate-800 flex flex-col items-center space-y-2 relative">
              <div className="w-full flex items-center justify-between text-[11px] text-slate-300 px-1">
                <span className="font-bold">1. Drag 4 Corners to Comic Edges</span>
                <span className="text-slate-400">Perspective Quad</span>
              </div>

              <div
                ref={cropContainerRef}
                className="relative inline-block select-none touch-none max-w-full overflow-hidden rounded-lg"
              >
                <img
                  src={rotatedPreviewUrl}
                  alt="Source for perspective crop"
                  draggable={false}
                  className="block max-h-80 w-auto max-w-full object-contain pointer-events-none select-none"
                />

                {/* SVG Quad Overlay + Grid Lines */}
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  {/* Dimmed exterior polygon using evenodd fill rule */}
                  <path
                    d={`M 0 0 L 100 0 L 100 100 L 0 100 Z M ${quad[0].x * 100} ${quad[0].y * 100} L ${
                      quad[1].x * 100
                    } ${quad[1].y * 100} L ${quad[2].x * 100} ${quad[2].y * 100} L ${
                      quad[3].x * 100
                    } ${quad[3].y * 100} Z`}
                    fill="rgba(15, 23, 42, 0.58)"
                    fillRule="evenodd"
                  />

                  {/* Perspective Grid Lines (1/3 and 2/3 interpolations) */}
                  {[1 / 3, 2 / 3].map((t) => {
                    const lx = (quad[0].x + (quad[3].x - quad[0].x) * t) * 100;
                    const ly = (quad[0].y + (quad[3].y - quad[0].y) * t) * 100;
                    const rx = (quad[1].x + (quad[2].x - quad[1].x) * t) * 100;
                    const ry = (quad[1].y + (quad[2].y - quad[1].y) * t) * 100;

                    const tx = (quad[0].x + (quad[1].x - quad[0].x) * t) * 100;
                    const ty = (quad[0].y + (quad[1].y - quad[0].y) * t) * 100;
                    const bx = (quad[3].x + (quad[2].x - quad[3].x) * t) * 100;
                    const by = (quad[3].y + (quad[2].y - quad[3].y) * t) * 100;

                    return (
                      <g key={t} stroke="rgba(56, 189, 248, 0.45)" strokeWidth="0.4" strokeDasharray="1.5 1.5">
                        <line x1={lx} y1={ly} x2={rx} y2={ry} />
                        <line x1={tx} y1={ty} x2={bx} y2={by} />
                      </g>
                    );
                  })}

                  {/* Quad Perimeter */}
                  <polygon
                    points={quad.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="0.9"
                  />
                </svg>

                {/* 4 Draggable Corner Handles */}
                {quad.map((pt, idx) => (
                  <div
                    key={CORNER_LABELS[idx]}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setActiveCornerIdx(idx);
                    }}
                    style={{
                      left: `${pt.x * 100}%`,
                      top: `${pt.y * 100}%`,
                    }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 flex items-center justify-center text-[9px] font-black shadow-md cursor-grab active:cursor-grabbing transition-transform ${
                      activeCornerIdx === idx
                        ? 'bg-sky-400 border-white text-slate-950 scale-125 z-20'
                        : 'bg-slate-900/90 border-sky-400 text-sky-300 hover:scale-110 z-10'
                    }`}
                    title={`Drag ${CORNER_LABELS[idx]} corner`}
                  >
                    {CORNER_LABELS[idx]}
                  </div>
                ))}
              </div>

              {/* Corner Zoom Magnifier Loupe while dragging */}
              {activeCornerIdx !== null && (
                <div
                  className={`absolute ${
                    quad[activeCornerIdx].x > 0.5 ? 'left-3' : 'right-3'
                  } top-9 z-30 bg-slate-950 border-2 border-sky-400 rounded-xl overflow-hidden shadow-xl pointer-events-none`}
                >
                  <canvas ref={loupeCanvasRef} width={88} height={88} className="block w-22 h-22" />
                  <div className="bg-slate-900/90 text-[9px] font-bold text-center text-sky-300 py-0.5">
                    {CORNER_LABELS[activeCornerIdx]} Corner Zoom
                  </div>
                </div>
              )}
            </div>

            {/* Right: Flattened & Deskewed Output Preview */}
            <div className="bg-slate-900 rounded-2xl p-3 border border-slate-800 flex flex-col items-center space-y-2">
              <div className="w-full flex items-center justify-between text-[11px] text-slate-300 px-1">
                <span className="font-bold">2. Flattened & Deskewed Result</span>
                {warpedDimensions && (
                  <span className="font-mono text-[10px] text-emerald-400">
                    {warpedDimensions.width}×{warpedDimensions.height}px
                  </span>
                )}
              </div>

              <div className="flex items-center justify-center min-h-56 max-h-80 w-full bg-slate-950/60 rounded-lg p-2">
                {warpedPreviewUrl ? (
                  <img
                    src={warpedPreviewUrl}
                    alt="Warped and deskewed preview"
                    className="max-h-72 w-auto object-contain rounded shadow-lg border border-slate-700"
                  />
                ) : (
                  <span className="text-xs text-slate-500">Generating preview...</span>
                )}
              </div>

              <div className="w-full flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadCroppedImage}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
                  title="Download flattened JPG named for Google Drive"
                >
                  <Download className="w-3.5 h-3.5 text-sky-400" />
                  <span>Download JPG</span>
                </button>

                {!enableOcr && (
                  <button
                    type="button"
                    onClick={() => handleRunOcr(false)}
                    disabled={isRunningOcr}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Optionally run local OCR on this cover"
                  >
                    {isRunningOcr ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    )}
                    <span>Detect Text (OCR)</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* OCR Progress Banner */}
          {isRunningOcr && (
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-indigo-900 dark:text-indigo-200">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                  <span>{ocrStatusText || 'Running local OCR on cropped cover...'}</span>
                </span>
                <span>{ocrProgress}%</span>
              </div>
              <div className="w-full bg-indigo-200 dark:bg-indigo-900 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-600 h-full transition-all duration-200"
                  style={{ width: `${ocrProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* OCR Detected Title & Issue # Results + Clickable Candidate Chips */}
          {ocrResult && !isRunningOcr && (
            <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 rounded-xl space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    OCR Detection Complete
                    {ocrResult.matchedExistingSeries ? ' (Matched Catalog Series!)' : ''}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => handleRunOcr(false)}
                  className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Re-run OCR</span>
                </button>
              </div>

              {ocrResult.candidateTitles.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
                    Detected Title Candidates (click to apply):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {ocrResult.candidateTitles.map((cand) => (
                      <button
                        key={cand}
                        type="button"
                        onClick={() => onSelectOcrCandidate?.('title', cand)}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-slate-800 dark:text-slate-100 font-bold text-xs hover:bg-emerald-100 dark:hover:bg-emerald-900/50 cursor-pointer"
                      >
                        {cand}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {ocrResult.candidateIssues.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
                    Detected Issue # Candidates (click to apply):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {ocrResult.candidateIssues.map((iss) => (
                      <button
                        key={iss}
                        type="button"
                        onClick={() => onSelectOcrCandidate?.('issueNumber', iss)}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-slate-800 dark:text-slate-100 font-mono font-bold text-xs hover:bg-emerald-100 dark:hover:bg-emerald-900/50 cursor-pointer"
                      >
                        #{iss}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Footer */}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Cancel
              </button>
            )}

            {enableOcr && (
              <button
                type="button"
                onClick={() => {
                  const output = generateFinalWarpedOutput();
                  if (output) onApplyImage(output.dataUrl, ocrResult || undefined);
                }}
                disabled={isRunningOcr}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                Apply Cropped Image Only (Skip OCR)
              </button>
            )}

            <button
              type="button"
              onClick={handleApplyCrop}
              disabled={isRunningOcr}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isRunningOcr ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>
                {applyButtonLabel ||
                  (enableOcr
                    ? ocrResult
                      ? 'Apply Cropped Cover & OCR Details'
                      : 'Crop Cover & Detect Title / Issue # (OCR)'
                    : 'Save Cropped Cover')}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
