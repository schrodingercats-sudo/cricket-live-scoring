/**
 * Professional Image Crop & Position Editor
 * Provides 1:1 Fixed Square Framing, Smooth Dragging, Zooming, Rotation & Live Preview
 * Compatible with Desktop (Mouse, Wheel) & Mobile (Touch Drag, Pinch-to-Zoom)
 */

(function () {
  "use strict";

  let cropModalEl = null;
  let viewportCanvas = null;
  let viewportCtx = null;
  let previewCanvasSquare = null;
  let previewCtxSquare = null;
  let previewCanvasCircle = null;
  let previewCtxCircle = null;

  let zoomSlider = null;
  let zoomValueText = null;

  // Active Crop State
  let currentFile = null;
  let currentImage = null;
  let currentTitle = "Crop Image";
  let currentOptions = {};

  let imgWidth = 0;
  let imgHeight = 0;
  let baseScale = 1; // scale needed to cover the crop box at 1x zoom
  let zoom = 1.0;
  let minZoom = 1.0;
  let maxZoom = 4.0;
  let rotation = 0; // 0, 90, 180, 270 degrees
  let panX = 0; // translation in viewport pixels relative to center
  let panY = 0;

  // Viewport & Crop Box Dimensions
  const VIEWPORT_SIZE = 320;
  const CROP_BOX_SIZE = 260; // Size of the fixed square frame in the viewport

  // Interaction tracking
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let panStartX = 0;
  let panStartY = 0;

  // Pinch Zoom tracking
  let touchStartDistance = 0;
  let touchStartZoom = 1.0;

  function initCropEditorDOM() {
    if (document.getElementById("image-crop-modal")) return;

    const modalHTML = `
      <div id="image-crop-modal" class="crop-modal-overlay">
        <div class="crop-modal-card" role="dialog" aria-modal="true" aria-labelledby="crop-modal-title">
          <!-- Header -->
          <div class="crop-modal-header">
            <div class="crop-modal-title-group">
              <span class="crop-modal-title-icon">✂️</span>
              <div>
                <h3 id="crop-modal-title" class="crop-modal-title">Crop & Position Image</h3>
                <p class="crop-modal-subtitle">Drag image to position • Zoom to fit player or logo perfectly</p>
              </div>
            </div>
            <button type="button" class="crop-modal-close-btn" id="btn-crop-modal-close" title="Close without saving">✕</button>
          </div>

          <!-- Body -->
          <div class="crop-modal-body">
            <!-- Left Stage -->
            <div class="crop-stage-wrapper">
              <div id="crop-viewport-container" class="crop-viewport-container" title="Drag to position image, scroll to zoom">
                <canvas id="crop-viewport-canvas" class="crop-viewport-canvas" width="${VIEWPORT_SIZE}" height="${VIEWPORT_SIZE}"></canvas>
              </div>
              <div class="crop-stage-hint">
                <span>🖱️ Drag to position</span>
                <span>•</span>
                <span>🔍 Wheel to zoom</span>
              </div>
            </div>

            <!-- Right Controls & Previews -->
            <div class="crop-sidebar-tools">
              <!-- Live Previews -->
              <div class="crop-preview-section">
                <div class="crop-preview-title">
                  <span>📺 Live Preview</span>
                  <span style="color: #94a3b8; font-size: 0.68rem; font-weight: 600;">1:1 Square Output</span>
                </div>
                <div class="crop-previews-row">
                  <div class="crop-preview-box">
                    <div class="crop-preview-thumb-square">
                      <canvas id="crop-preview-square" class="crop-preview-canvas" width="64" height="64"></canvas>
                    </div>
                    <span class="crop-preview-label">Card View</span>
                  </div>
                  <div class="crop-preview-box">
                    <div class="crop-preview-thumb-circle">
                      <canvas id="crop-preview-circle" class="crop-preview-canvas" width="64" height="64"></canvas>
                    </div>
                    <span class="crop-preview-label">Avatar View</span>
                  </div>
                </div>
              </div>

              <!-- Zoom Controls -->
              <div class="crop-control-group">
                <div class="crop-control-label">
                  <span>🔍 Zoom Level</span>
                  <span id="crop-zoom-value" style="color: #38bdf8; font-family: monospace;">1.00x</span>
                </div>
                <div class="crop-zoom-bar">
                  <button type="button" id="btn-crop-zoom-out" class="btn-crop-tool" title="Zoom Out">－</button>
                  <input type="range" id="crop-zoom-slider" class="crop-slider" min="1.0" max="4.0" step="0.02" value="1.0">
                  <button type="button" id="btn-crop-zoom-in" class="btn-crop-tool" title="Zoom In">＋</button>
                </div>
              </div>

              <!-- Rotate & Reset Actions -->
              <div class="crop-control-group">
                <div class="crop-control-label">
                  <span>🔄 Orientation & Reset</span>
                </div>
                <div class="crop-actions-grid">
                  <button type="button" id="btn-crop-rotate-left" class="btn-crop-tool" title="Rotate 90° Left">
                    ↺ Left 90°
                  </button>
                  <button type="button" id="btn-crop-rotate-right" class="btn-crop-tool" title="Rotate 90° Right">
                    ↻ Right 90°
                  </button>
                  <button type="button" id="btn-crop-reset" class="btn-crop-tool" title="Reset zoom and position">
                    🔄 Reset
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="crop-modal-footer">
            <button type="button" id="btn-crop-cancel" class="btn-crop-cancel">Cancel</button>
            <button type="button" id="btn-crop-apply" class="btn-crop-apply">
              <span>✓</span> Apply Crop & Use
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);

    // Cache elements
    cropModalEl = document.getElementById("image-crop-modal");
    viewportCanvas = document.getElementById("crop-viewport-canvas");
    viewportCtx = viewportCanvas ? viewportCanvas.getContext("2d") : null;

    previewCanvasSquare = document.getElementById("crop-preview-square");
    previewCtxSquare = previewCanvasSquare ? previewCanvasSquare.getContext("2d") : null;

    previewCanvasCircle = document.getElementById("crop-preview-circle");
    previewCtxCircle = previewCanvasCircle ? previewCanvasCircle.getContext("2d") : null;

    zoomSlider = document.getElementById("crop-zoom-slider");
    zoomValueText = document.getElementById("crop-zoom-value");

    bindCropEvents();
  }

  function bindCropEvents() {
    const container = document.getElementById("crop-viewport-container");
    const closeBtn = document.getElementById("btn-crop-modal-close");
    const cancelBtn = document.getElementById("btn-crop-cancel");
    const applyBtn = document.getElementById("btn-crop-apply");
    const resetBtn = document.getElementById("btn-crop-reset");
    const zoomInBtn = document.getElementById("btn-crop-zoom-in");
    const zoomOutBtn = document.getElementById("btn-crop-zoom-out");
    const rotateLeftBtn = document.getElementById("btn-crop-rotate-left");
    const rotateRightBtn = document.getElementById("btn-crop-rotate-right");

    if (closeBtn) closeBtn.onclick = closeCropEditor;
    if (cancelBtn) cancelBtn.onclick = closeCropEditor;
    if (applyBtn) applyBtn.onclick = applyAndExportCrop;

    if (resetBtn) {
      resetBtn.onclick = () => {
        zoom = 1.0;
        panX = 0;
        panY = 0;
        rotation = 0;
        if (zoomSlider) zoomSlider.value = "1.0";
        if (zoomValueText) zoomValueText.innerText = "1.00x";
        clampPanAndDraw();
      };
    }

    if (zoomSlider) {
      zoomSlider.oninput = (e) => {
        zoom = parseFloat(e.target.value);
        if (zoomValueText) zoomValueText.innerText = zoom.toFixed(2) + "x";
        clampPanAndDraw();
      };
    }

    if (zoomInBtn) {
      zoomInBtn.onclick = () => {
        zoom = Math.min(maxZoom, zoom + 0.15);
        if (zoomSlider) zoomSlider.value = zoom.toString();
        if (zoomValueText) zoomValueText.innerText = zoom.toFixed(2) + "x";
        clampPanAndDraw();
      };
    }

    if (zoomOutBtn) {
      zoomOutBtn.onclick = () => {
        zoom = Math.max(minZoom, zoom - 0.15);
        if (zoomSlider) zoomSlider.value = zoom.toString();
        if (zoomValueText) zoomValueText.innerText = zoom.toFixed(2) + "x";
        clampPanAndDraw();
      };
    }

    if (rotateLeftBtn) {
      rotateLeftBtn.onclick = () => {
        rotation = (rotation - 90 + 360) % 360;
        recalculateBaseScale();
        clampPanAndDraw();
      };
    }

    if (rotateRightBtn) {
      rotateRightBtn.onclick = () => {
        rotation = (rotation + 90) % 360;
        recalculateBaseScale();
        clampPanAndDraw();
      };
    }

    // --- Mouse Drag Interaction ---
    if (container) {
      container.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return; // only left click
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        panStartX = panX;
        panStartY = panY;
      });

      window.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        panX = panStartX + dx;
        panY = panStartY + dy;
        clampPanAndDraw();
      });

      window.addEventListener("mouseup", () => {
        if (isDragging) {
          isDragging = false;
        }
      });

      // Desktop Mouse Wheel Zoom
      container.addEventListener("wheel", (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        zoom = Math.min(maxZoom, Math.max(minZoom, zoom + delta));
        if (zoomSlider) zoomSlider.value = zoom.toString();
        if (zoomValueText) zoomValueText.innerText = zoom.toFixed(2) + "x";
        clampPanAndDraw();
      }, { passive: false });

      // --- Mobile Touch Gestures (Single Finger Drag + Two-Finger Pinch Zoom) ---
      container.addEventListener("touchstart", (e) => {
        if (e.touches.length === 1) {
          isDragging = true;
          dragStartX = e.touches[0].clientX;
          dragStartY = e.touches[0].clientY;
          panStartX = panX;
          panStartY = panY;
        } else if (e.touches.length === 2) {
          isDragging = false;
          touchStartDistance = getTouchDistance(e.touches);
          touchStartZoom = zoom;
        }
      }, { passive: false });

      container.addEventListener("touchmove", (e) => {
        e.preventDefault();
        if (e.touches.length === 1 && isDragging) {
          const dx = e.touches[0].clientX - dragStartX;
          const dy = e.touches[0].clientY - dragStartY;
          panX = panStartX + dx;
          panY = panStartY + dy;
          clampPanAndDraw();
        } else if (e.touches.length === 2 && touchStartDistance > 0) {
          const currentDist = getTouchDistance(e.touches);
          const factor = currentDist / touchStartDistance;
          zoom = Math.min(maxZoom, Math.max(minZoom, touchStartZoom * factor));
          if (zoomSlider) zoomSlider.value = zoom.toString();
          if (zoomValueText) zoomValueText.innerText = zoom.toFixed(2) + "x";
          clampPanAndDraw();
        }
      }, { passive: false });

      container.addEventListener("touchend", () => {
        isDragging = false;
        touchStartDistance = 0;
      });
      container.addEventListener("touchcancel", () => {
        isDragging = false;
        touchStartDistance = 0;
      });
    }
  }

  function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Recalculate base scale so the image completely fills the CROP_BOX_SIZE at 1.0x zoom
   */
  function recalculateBaseScale() {
    if (!currentImage) return;

    // Determine current effective dimensions based on 90/270 rotation
    const isRotated90 = (rotation === 90 || rotation === 270);
    const effWidth = isRotated90 ? imgHeight : imgWidth;
    const effHeight = isRotated90 ? imgWidth : imgHeight;

    // We want the image to COVER the CROP_BOX_SIZE
    const scaleX = CROP_BOX_SIZE / effWidth;
    const scaleY = CROP_BOX_SIZE / effHeight;
    baseScale = Math.max(scaleX, scaleY);
  }

  /**
   * Clamp pan offsets so the image doesn't expose empty transparent background inside the crop frame
   */
  function clampPanAndDraw() {
    if (!currentImage) return;

    const isRotated90 = (rotation === 90 || rotation === 270);
    const effWidth = isRotated90 ? imgHeight : imgWidth;
    const effHeight = isRotated90 ? imgWidth : imgHeight;

    const currentRenderWidth = effWidth * baseScale * zoom;
    const currentRenderHeight = effHeight * baseScale * zoom;

    const maxPanX = Math.max(0, (currentRenderWidth - CROP_BOX_SIZE) / 2);
    const maxPanY = Math.max(0, (currentRenderHeight - CROP_BOX_SIZE) / 2);

    panX = Math.min(maxPanX, Math.max(-maxPanX, panX));
    panY = Math.min(maxPanY, Math.max(-maxPanY, panY));

    drawCropViewport();
    drawLivePreviews();
  }

  /**
   * Main Stage Render
   */
  function drawCropViewport() {
    if (!viewportCtx || !currentImage) return;

    const vWidth = VIEWPORT_SIZE;
    const vHeight = VIEWPORT_SIZE;
    const centerX = vWidth / 2;
    const centerY = vHeight / 2;

    viewportCtx.clearRect(0, 0, vWidth, vHeight);

    // 1. Draw transformed image in viewport background
    viewportCtx.save();
    viewportCtx.translate(centerX + panX, centerY + panY);
    viewportCtx.rotate((rotation * Math.PI) / 180);
    viewportCtx.scale(baseScale * zoom, baseScale * zoom);

    viewportCtx.imageSmoothingEnabled = true;
    viewportCtx.imageSmoothingQuality = "high";

    viewportCtx.drawImage(
      currentImage,
      -imgWidth / 2,
      -imgHeight / 2,
      imgWidth,
      imgHeight
    );
    viewportCtx.restore();

    // 2. Draw Darkened Overlay Mask with Fixed Square Window
    const cropX = (vWidth - CROP_BOX_SIZE) / 2;
    const cropY = (vHeight - CROP_BOX_SIZE) / 2;

    viewportCtx.save();
    viewportCtx.fillStyle = "rgba(4, 8, 16, 0.72)";

    // Top rectangle
    viewportCtx.fillRect(0, 0, vWidth, cropY);
    // Bottom rectangle
    viewportCtx.fillRect(0, cropY + CROP_BOX_SIZE, vWidth, vHeight - (cropY + CROP_BOX_SIZE));
    // Left rectangle
    viewportCtx.fillRect(0, cropY, cropX, CROP_BOX_SIZE);
    // Right rectangle
    viewportCtx.fillRect(cropX + CROP_BOX_SIZE, cropY, vWidth - (cropX + CROP_BOX_SIZE), CROP_BOX_SIZE);

    // 3. Draw Rule of Thirds Grid Lines inside Crop Box
    viewportCtx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    viewportCtx.lineWidth = 1;
    viewportCtx.setLineDash([4, 4]);

    const step = CROP_BOX_SIZE / 3;
    // Vertical grid lines
    viewportCtx.beginPath();
    viewportCtx.moveTo(cropX + step, cropY);
    viewportCtx.lineTo(cropX + step, cropY + CROP_BOX_SIZE);
    viewportCtx.moveTo(cropX + step * 2, cropY);
    viewportCtx.lineTo(cropX + step * 2, cropY + CROP_BOX_SIZE);

    // Horizontal grid lines
    viewportCtx.moveTo(cropX, cropY + step);
    viewportCtx.lineTo(cropX + CROP_BOX_SIZE, cropY + step);
    viewportCtx.moveTo(cropX, cropY + step * 2);
    viewportCtx.lineTo(cropX + CROP_BOX_SIZE, cropY + step * 2);
    viewportCtx.stroke();
    viewportCtx.setLineDash([]);

    // 4. Draw Crop Frame Glowing Border
    viewportCtx.strokeStyle = "#38bdf8";
    viewportCtx.lineWidth = 2;
    viewportCtx.strokeRect(cropX, cropY, CROP_BOX_SIZE, CROP_BOX_SIZE);

    // 5. Draw Gold Corner Brackets for Professional Sports Aesthetic
    viewportCtx.strokeStyle = "#fbbf24";
    viewportCtx.lineWidth = 3.5;
    const cornerLen = 14;

    // Top-Left
    viewportCtx.beginPath();
    viewportCtx.moveTo(cropX, cropY + cornerLen);
    viewportCtx.lineTo(cropX, cropY);
    viewportCtx.lineTo(cropX + cornerLen, cropY);
    viewportCtx.stroke();

    // Top-Right
    viewportCtx.beginPath();
    viewportCtx.moveTo(cropX + CROP_BOX_SIZE - cornerLen, cropY);
    viewportCtx.lineTo(cropX + CROP_BOX_SIZE, cropY);
    viewportCtx.lineTo(cropX + CROP_BOX_SIZE, cropY + cornerLen);
    viewportCtx.stroke();

    // Bottom-Left
    viewportCtx.beginPath();
    viewportCtx.moveTo(cropX, cropY + CROP_BOX_SIZE - cornerLen);
    viewportCtx.lineTo(cropX, cropY + CROP_BOX_SIZE);
    viewportCtx.lineTo(cropX + cornerLen, cropY + CROP_BOX_SIZE);
    viewportCtx.stroke();

    // Bottom-Right
    viewportCtx.beginPath();
    viewportCtx.moveTo(cropX + CROP_BOX_SIZE - cornerLen, cropY + CROP_BOX_SIZE);
    viewportCtx.lineTo(cropX + CROP_BOX_SIZE, cropY + CROP_BOX_SIZE);
    viewportCtx.lineTo(cropX + CROP_BOX_SIZE, cropY + CROP_BOX_SIZE - cornerLen);
    viewportCtx.stroke();

    viewportCtx.restore();
  }

  /**
   * Render Live Thumbnail Previews
   */
  function drawLivePreviews() {
    if (!currentImage) return;

    const renderPreview = (canvas, ctx, isCircle = false) => {
      if (!ctx || !canvas) return;
      const size = canvas.width;
      ctx.clearRect(0, 0, size, size);

      ctx.save();
      if (isCircle) {
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.clip();
      }

      // Map from CROP_BOX_SIZE to preview canvas size
      const previewScale = size / CROP_BOX_SIZE;
      ctx.translate(size / 2 + panX * previewScale, size / 2 + panY * previewScale);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(baseScale * zoom * previewScale, baseScale * zoom * previewScale);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      ctx.drawImage(
        currentImage,
        -imgWidth / 2,
        -imgHeight / 2,
        imgWidth,
        imgHeight
      );

      ctx.restore();
    };

    renderPreview(previewCanvasSquare, previewCtxSquare, false);
    renderPreview(previewCanvasCircle, previewCtxCircle, true);
  }

  /**
   * Apply Crop and Generate High-Resolution Output File
   */
  function applyAndExportCrop() {
    if (!currentImage) return;

    const outputSize = currentOptions.outputWidth || 800; // 800x800 standardized output
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = outputSize;
    exportCanvas.height = outputSize;
    const exportCtx = exportCanvas.getContext("2d");

    const exportScale = outputSize / CROP_BOX_SIZE;

    exportCtx.save();
    // High-quality rendering
    exportCtx.imageSmoothingEnabled = true;
    exportCtx.imageSmoothingQuality = "high";

    exportCtx.translate(outputSize / 2 + panX * exportScale, outputSize / 2 + panY * exportScale);
    exportCtx.rotate((rotation * Math.PI) / 180);
    exportCtx.scale(baseScale * zoom * exportScale, baseScale * zoom * exportScale);

    exportCtx.drawImage(
      currentImage,
      -imgWidth / 2,
      -imgHeight / 2,
      imgWidth,
      imgHeight
    );
    exportCtx.restore();

    // Determine output mime type (PNG for transparent/original PNG, else JPEG for photos)
    const isPng = currentFile && (currentFile.type === "image/png" || currentFile.name?.toLowerCase().endsWith(".png"));
    const mimeType = isPng ? "image/png" : "image/jpeg";
    const quality = isPng ? undefined : 0.92;

    exportCanvas.toBlob((blob) => {
      if (!blob) {
        alert("Failed to export cropped image");
        return;
      }

      const originalName = currentFile?.name || "image.jpg";
      const ext = isPng ? ".png" : ".jpg";
      const baseName = originalName.substring(0, originalName.lastIndexOf(".")) || "cropped_photo";
      const finalFileName = `${baseName}_cropped${ext}`;

      const croppedFile = new File([blob], finalFileName, {
        type: mimeType,
        lastModified: Date.now()
      });

      const dataUrl = exportCanvas.toDataURL(mimeType, quality);

      const result = {
        file: croppedFile,
        blob: blob,
        dataUrl: dataUrl,
        width: outputSize,
        height: outputSize
      };

      if (typeof currentOptions.onApply === "function") {
        currentOptions.onApply(result);
      }

      closeCropEditor();
    }, mimeType, quality);
  }

  function closeCropEditor() {
    if (cropModalEl) {
      cropModalEl.classList.remove("active");
    }
    if (typeof currentOptions.onCancel === "function") {
      currentOptions.onCancel();
    }
    currentImage = null;
    currentFile = null;
  }

  /**
   * Public API: Open Image Crop & Position Editor
   * @param {Object} options
   *   - file: File object (or imageSrc)
   *   - imageSrc: string (optional if file provided)
   *   - title: string (e.g. "Crop Player Photo" / "Crop Team Logo")
   *   - outputWidth: number (default 800)
   *   - outputHeight: number (default 800)
   *   - onApply: function(result)
   *   - onCancel: function()
   */
  function openImageCropEditor(options = {}) {
    initCropEditorDOM();
    currentOptions = options;
    currentFile = options.file || null;
    currentTitle = options.title || "Crop & Position Image";

    const titleEl = document.getElementById("crop-modal-title");
    if (titleEl) titleEl.innerText = currentTitle;

    // Reset default parameters
    zoom = 1.0;
    panX = 0;
    panY = 0;
    rotation = 0;
    if (zoomSlider) zoomSlider.value = "1.0";
    if (zoomValueText) zoomValueText.innerText = "1.00x";

    const loadImageSrc = (src) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        currentImage = img;
        imgWidth = img.naturalWidth || img.width;
        imgHeight = img.naturalHeight || img.height;
        recalculateBaseScale();
        clampPanAndDraw();
        if (cropModalEl) cropModalEl.classList.add("active");
      };
      img.onerror = () => {
        alert("Failed to load image for cropping.");
      };
      img.src = src;
    };

    if (options.file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        loadImageSrc(e.target.result);
      };
      reader.readAsDataURL(options.file);
    } else if (options.imageSrc) {
      loadImageSrc(options.imageSrc);
    } else {
      console.warn("openImageCropEditor requires a file or imageSrc option");
    }
  }

  // Export globally
  window.openImageCropEditor = openImageCropEditor;
  window.closeCropEditor = closeCropEditor;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCropEditorDOM);
  } else {
    initCropEditorDOM();
  }
})();
