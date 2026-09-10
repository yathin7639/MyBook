/**
 * Book Doubt Viewer - Application Logic
 * Matches the clean, minimal study tool reference UI.
 */

(function () {
  'use strict';

  // State Management
  const state = {
    photos: [],
    filteredPhotos: [],
    searchQuery: '',
    
    // Inspection Viewer State
    viewerOpen: false,
    activePhotoIndex: -1,
    scale: 1,
    panX: 0,
    panY: 0,
    rotation: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    initialPanX: 0,
    initialPanY: 0,
    
    // Pinch to zoom state
    initialPinchDistance: null,
    initialPinchScale: 1,

    // Pending deletion ID or 'ALL'
    pendingDeleteTarget: null
  };

  const MIN_SCALE = 1.0;
  const MAX_SCALE = 8.0;
  const ZOOM_STEP = 0.3;

  // DOM Elements
  const el = {
    photoCountBadge: document.getElementById('photoCountBadge'),
    storageBadge: document.getElementById('storageBadge'),

    // Upload
    fileInput: document.getElementById('fileInput'),
    dropzone: document.getElementById('dropzone'),
    addPhotosBtn: document.getElementById('addPhotosBtn'),
    uploadProgressContainer: document.getElementById('uploadProgressContainer'),
    progressStatus: document.getElementById('progressStatus'),
    progressPercent: document.getElementById('progressPercent'),
    progressBar: document.getElementById('progressBar'),
    progressDetail: document.getElementById('progressDetail'),

    // Gallery & Actions
    photoGrid: document.getElementById('photoGrid'),
    searchInput: document.getElementById('searchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    deleteAllBtn: document.getElementById('deleteAllBtn'),

    // Inspection Viewer
    viewerOverlay: document.getElementById('viewerOverlay'),
    viewerFilename: document.getElementById('viewerFilename'),
    viewerCounter: document.getElementById('viewerCounter'),
    viewerSize: document.getElementById('viewerSize'),
    viewerDownloadBtn: document.getElementById('viewerDownloadBtn'),
    viewerHelpBtn: document.getElementById('viewerHelpBtn'),
    viewerCloseBtn: document.getElementById('viewerCloseBtn'),
    viewerViewport: document.getElementById('viewerViewport'),
    viewerStage: document.getElementById('viewerStage'),
    viewerImage: document.getElementById('viewerImage'),
    viewerPrevBtn: document.getElementById('viewerPrevBtn'),
    viewerNextBtn: document.getElementById('viewerNextBtn'),
    viewerPanHint: document.getElementById('viewerPanHint'),

    // Controls
    btnZoomIn: document.getElementById('btnZoomIn'),
    btnZoomOut: document.getElementById('btnZoomOut'),
    zoomPercentage: document.getElementById('zoomPercentage'),
    btnResetZoom: document.getElementById('btnResetZoom'),
    btnRotate: document.getElementById('btnRotate'),
    btnPreset2x: document.getElementById('btnPreset2x'),
    btnPreset4x: document.getElementById('btnPreset4x'),

    // Modals
    helpModal: document.getElementById('helpModal'),
    closeHelpModal: document.getElementById('closeHelpModal'),
    dismissHelpModal: document.getElementById('dismissHelpModal'),

    confirmModal: document.getElementById('confirmModal'),
    confirmModalTitle: document.getElementById('confirmModalTitle'),
    confirmModalBody: document.getElementById('confirmModalBody'),
    closeConfirmModal: document.getElementById('closeConfirmModal'),
    cancelConfirmBtn: document.getElementById('cancelConfirmBtn'),
    executeConfirmBtn: document.getElementById('executeConfirmBtn'),

    toastContainer: document.getElementById('toastContainer')
  };

  function init() {
    setupEventListeners();
    fetchPhotos();
  }

  // Fixed tunnel URL dedicated to your GitHub Pages frontend
  const GITHUB_PAGES_BACKEND_URL = 'https://yathin-book-doubt-viewer.loca.lt';

  function getApiBase() {
    // 1. If user set a custom backend URL in settings, use it
    const custom = localStorage.getItem('doubt_viewer_backend_url');
    if (custom) return custom.replace(/\/+$/, '');

    // 2. If running on GitHub Pages or external domain, automatically use your laptop tunnel
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (!isLocal || window.location.hostname.includes('github.io')) {
      return GITHUB_PAGES_BACKEND_URL;
    }

    // 3. If running locally on localhost/127.0.0.1, use relative origin
    return '';
  }

  // =========================================================================
  // API Calls
  // =========================================================================
  async function fetchPhotos() {
    const apiBase = getApiBase();
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

    if (!apiBase && !isLocal) {
      showToast('Click "Local storage" at top-right to enter your laptop tunnel URL.', 'error');
      renderGallery();
      return;
    }

    try {
      const response = await fetch(`${apiBase}/api/photos`, {
        headers: { 'Bypass-Tunnel-Reminder': 'true' }
      });
      if (!response.ok) throw new Error(`Server status ${response.status}`);
      const data = await response.json();
      state.photos = Array.isArray(data) ? data : [];
      applyFilter();
      updateBadges();
    } catch (err) {
      console.error('Failed to fetch photos:', err);
      showToast('Could not connect to laptop backend. Click "Local storage" to update URL.', 'error');
      renderGallery();
    }
  }

  async function uploadFiles(files) {
    if (!files || files.length === 0) return;

    const validFiles = [];
    const maxSizeBytes = 50 * 1024 * 1024; // 50MB
    let nonImages = 0;
    let oversized = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) {
        nonImages++;
        continue;
      }
      if (file.size > maxSizeBytes) {
        oversized++;
        continue;
      }
      validFiles.push(file);
    }

    if (nonImages > 0) showToast(`Skipped ${nonImages} file(s): only images allowed.`, 'error');
    if (oversized > 0) showToast(`Skipped ${oversized} file(s): max size 50MB.`, 'error');
    if (validFiles.length === 0) return;

    const formData = new FormData();
    validFiles.forEach(file => formData.append('photos', file));

    showUploadProgress(true, `Uploading ${validFiles.length} photo(s)...`);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${getApiBase()}/api/photos`, true);
    xhr.setRequestHeader('Bypass-Tunnel-Reminder', 'true');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        updateUploadProgress(pct, `Uploading: ${pct}%`);
      }
    };

    xhr.onload = () => {
      showUploadProgress(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          showToast(`Added ${res.count || validFiles.length} book photo(s)`, 'success');
        } catch (e) {
          showToast('Uploaded photos successfully.', 'success');
        }
        fetchPhotos();
      } else {
        let errorMsg = 'Upload failed.';
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.error) errorMsg = res.error;
        } catch (e) {}
        showToast(errorMsg, 'error');
      }
    };

    xhr.onerror = () => {
      showUploadProgress(false);
      showToast('Network error during upload.', 'error');
    };

    xhr.send(formData);
  }

  async function deletePhoto(photoId) {
    try {
      const response = await fetch(`${getApiBase()}/api/photos/${encodeURIComponent(photoId)}`, {
        method: 'DELETE',
        headers: { 'Bypass-Tunnel-Reminder': 'true' }
      });

      if (!response.ok) throw new Error('Failed to delete photo.');
      showToast('Photo removed from storage.', 'success');

      if (state.viewerOpen) {
        const currentActive = state.filteredPhotos[state.activePhotoIndex];
        if (currentActive && currentActive.id === photoId) {
          closeViewer();
        }
      }
      fetchPhotos();
    } catch (err) {
      showToast('Could not delete photo: ' + err.message, 'error');
    }
  }

  async function deleteAllPhotos() {
    try {
      const response = await fetch(`${getApiBase()}/api/photos`, {
        method: 'DELETE',
        headers: { 'Bypass-Tunnel-Reminder': 'true' }
      });
      if (!response.ok) throw new Error('Failed to clear photos.');

      showToast('All textbook photos cleared.', 'success');
      if (state.viewerOpen) closeViewer();
      fetchPhotos();
    } catch (err) {
      showToast('Error clearing photos: ' + err.message, 'error');
    }
  }

  // =========================================================================
  // Gallery Rendering & Filtering
  // =========================================================================
  function applyFilter() {
    const q = state.searchQuery.trim().toLowerCase();
    if (!q) {
      state.filteredPhotos = [...state.photos];
    } else {
      state.filteredPhotos = state.photos.filter(p => (p.name || '').toLowerCase().includes(q));
    }
    renderGallery();
  }

  function updateBadges() {
    const total = state.photos.length;
    el.photoCountBadge.textContent = `${total} ${total === 1 ? 'photo' : 'photos'}`;
    el.deleteAllBtn.disabled = total === 0;
  }

  function renderGallery() {
    el.photoGrid.innerHTML = '';
    updateBadges();

    state.filteredPhotos.forEach((photo, index) => {
      const card = createCard(photo, index);
      el.photoGrid.appendChild(card);
    });
  }

  function createCard(photo, index) {
    const card = document.createElement('article');
    card.className = 'doubt-card';
    card.setAttribute('role', 'listitem');

    const formattedSize = formatFileSize(photo.size);
    const formattedDate = formatDate(photo.created);
    const imageUrl = `${getApiBase()}/uploads/${encodeURIComponent(photo.filename)}`;

    card.innerHTML = `
      <div class="doubt-thumbnail-container" data-index="${index}" title="Click to inspect question">
        <img class="doubt-thumbnail" src="${imageUrl}" alt="${escapeHtml(photo.name)}" loading="lazy">
        <div class="doubt-thumb-overlay">
          <span class="inspect-pill">Inspect</span>
        </div>
      </div>
      <div class="doubt-info">
        <h3 class="doubt-title" title="${escapeHtml(photo.name)}">${escapeHtml(photo.name)}</h3>
        <div class="doubt-meta-row">
          <span>${formattedSize}</span>
          <span>${formattedDate}</span>
        </div>
        <div class="doubt-actions">
          <button type="button" class="btn-card-open" data-index="${index}">Open</button>
          <button type="button" class="btn-card-delete" data-id="${photo.id}" data-name="${escapeHtml(photo.name)}" title="Delete photo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `;

    card.querySelector('.doubt-thumbnail-container').addEventListener('click', () => openViewer(index));
    card.querySelector('.btn-card-open').addEventListener('click', () => openViewer(index));
    card.querySelector('.btn-card-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      promptDelete(photo.id, photo.name);
    });

    return card;
  }

  // =========================================================================
  // Inspection Viewer (Zoom, Pan, Rotate, Shortcuts)
  // =========================================================================
  function openViewer(index) {
    if (index < 0 || index >= state.filteredPhotos.length) return;

    state.activePhotoIndex = index;
    state.viewerOpen = true;

    resetViewerTransform();
    loadViewerPhoto();

    el.viewerOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    el.viewerOverlay.focus();
  }

  function closeViewer() {
    state.viewerOpen = false;
    el.viewerOverlay.hidden = true;
    document.body.style.overflow = '';
    state.activePhotoIndex = -1;
  }

  function loadViewerPhoto() {
    const photo = state.filteredPhotos[state.activePhotoIndex];
    if (!photo) return;

    const imageUrl = `${getApiBase()}/uploads/${encodeURIComponent(photo.filename)}`;

    el.viewerFilename.textContent = photo.name;
    el.viewerFilename.title = photo.name;
    el.viewerCounter.textContent = `${state.activePhotoIndex + 1} of ${state.filteredPhotos.length}`;
    el.viewerSize.textContent = formatFileSize(photo.size);

    el.viewerDownloadBtn.href = imageUrl;
    el.viewerDownloadBtn.setAttribute('download', photo.name);

    el.viewerPrevBtn.disabled = state.filteredPhotos.length <= 1;
    el.viewerNextBtn.disabled = state.filteredPhotos.length <= 1;

    el.viewerImage.src = imageUrl;
    resetViewerTransform();
  }

  function navigateViewer(delta) {
    if (!state.viewerOpen || state.filteredPhotos.length <= 1) return;
    const len = state.filteredPhotos.length;
    let newIndex = state.activePhotoIndex + delta;
    if (newIndex < 0) newIndex = len - 1;
    if (newIndex >= len) newIndex = 0;
    state.activePhotoIndex = newIndex;
    loadViewerPhoto();
  }

  function resetViewerTransform() {
    state.scale = 1.0;
    state.panX = 0;
    state.panY = 0;
    state.rotation = 0;
    applyTransform(true);
  }

  function setZoom(newScale, targetX, targetY, smooth = true) {
    const clampedScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
    if (clampedScale === state.scale) return;

    if (targetX !== undefined && targetY !== undefined) {
      const viewportRect = el.viewerViewport.getBoundingClientRect();
      const originX = targetX - (viewportRect.left + viewportRect.width / 2);
      const originY = targetY - (viewportRect.top + viewportRect.height / 2);
      const scaleRatio = clampedScale / state.scale;
      state.panX = originX - (originX - state.panX) * scaleRatio;
      state.panY = originY - (originY - state.panY) * scaleRatio;
    } else {
      const scaleRatio = clampedScale / state.scale;
      state.panX = state.panX * scaleRatio;
      state.panY = state.panY * scaleRatio;
    }

    state.scale = clampedScale;
    if (state.scale === 1.0) {
      state.panX = 0;
      state.panY = 0;
    }
    applyTransform(smooth);
  }

  function zoomIn() { setZoom(state.scale + ZOOM_STEP); }
  function zoomOut() { setZoom(state.scale - ZOOM_STEP); }
  function rotateClockwise() {
    state.rotation = (state.rotation + 90) % 360;
    applyTransform(true);
  }

  function applyTransform(withTransition = false) {
    el.viewerStage.style.transition = withTransition ? 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)' : 'none';
    el.viewerStage.style.transform = `translate(-50%, -50%) translate(${state.panX}px, ${state.panY}px) scale(${state.scale}) rotate(${state.rotation}deg)`;

    const pct = Math.round(state.scale * 100);
    el.zoomPercentage.textContent = `${pct}%`;

    el.viewerPanHint.style.opacity = state.scale > 1.0 ? '0.9' : '0.4';
  }

  // Interactive gestures
  function setupViewerInteractions() {
    const viewport = el.viewerViewport;

    // Mouse Wheel Zoom
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      setZoom(state.scale * zoomFactor, e.clientX, e.clientY, false);
    }, { passive: false });

    // Mouse Drag Panning
    viewport.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.viewer-nav-btn') || e.target.closest('.viewer-dock')) return;

      state.isDragging = true;
      viewport.classList.add('is-panning');
      state.dragStartX = e.clientX;
      state.dragStartY = e.clientY;
      state.initialPanX = state.panX;
      state.initialPanY = state.panY;
      el.viewerStage.style.transition = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!state.isDragging || !state.viewerOpen) return;
      const dx = e.clientX - state.dragStartX;
      const dy = e.clientY - state.dragStartY;
      state.panX = state.initialPanX + dx;
      state.panY = state.initialPanY + dy;
      applyTransform(false);
    });

    window.addEventListener('mouseup', () => {
      if (state.isDragging) {
        state.isDragging = false;
        viewport.classList.remove('is-panning');
      }
    });

    // Touch support (1 finger drag, 2 finger pinch)
    viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        state.isDragging = true;
        state.dragStartX = e.touches[0].clientX;
        state.dragStartY = e.touches[0].clientY;
        state.initialPanX = state.panX;
        state.initialPanY = state.panY;
        el.viewerStage.style.transition = 'none';
      } else if (e.touches.length === 2) {
        state.isDragging = false;
        state.initialPinchDistance = getTouchDistance(e.touches[0], e.touches[1]);
        state.initialPinchScale = state.scale;
      }
    }, { passive: true });

    viewport.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && state.isDragging) {
        const dx = e.touches[0].clientX - state.dragStartX;
        const dy = e.touches[0].clientY - state.dragStartY;
        state.panX = state.initialPanX + dx;
        state.panY = state.initialPanY + dy;
        applyTransform(false);
      } else if (e.touches.length === 2 && state.initialPinchDistance) {
        const currentDist = getTouchDistance(e.touches[0], e.touches[1]);
        const targetScale = state.initialPinchScale * (currentDist / state.initialPinchDistance);
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        setZoom(targetScale, midX, midY, false);
      }
    }, { passive: true });

    viewport.addEventListener('touchend', (e) => {
      if (e.touches.length === 0) {
        state.isDragging = false;
        state.initialPinchDistance = null;
      } else if (e.touches.length === 1) {
        state.isDragging = true;
        state.dragStartX = e.touches[0].clientX;
        state.dragStartY = e.touches[0].clientY;
        state.initialPanX = state.panX;
        state.initialPanY = state.panY;
        state.initialPinchDistance = null;
      }
    });
  }

  function getTouchDistance(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Keyboard Shortcuts
  function handleKeyDown(e) {
    if (document.activeElement === el.searchInput) {
      if (e.key === 'Escape') {
        el.searchInput.value = '';
        state.searchQuery = '';
        applyFilter();
        el.clearSearchBtn.hidden = true;
        el.searchInput.blur();
      }
      return;
    }

    if (e.key === 'Escape') {
      if (!el.helpModal.hidden) { el.helpModal.hidden = true; return; }
      if (!el.confirmModal.hidden) { el.confirmModal.hidden = true; return; }
      if (state.viewerOpen) { closeViewer(); return; }
    }

    if (state.viewerOpen) {
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); navigateViewer(-1); break;
        case 'ArrowRight': e.preventDefault(); navigateViewer(1); break;
        case '+': case '=': e.preventDefault(); zoomIn(); break;
        case '-': case '_': e.preventDefault(); zoomOut(); break;
        case '0': e.preventDefault(); resetViewerTransform(); break;
        case 'r': case 'R': e.preventDefault(); rotateClockwise(); break;
        case 'h': case 'H': case '?': e.preventDefault(); el.helpModal.hidden = false; break;
      }
    }
  }

  // Deletion Modals
  function promptDelete(id, name) {
    state.pendingDeleteTarget = id;
    el.confirmModalTitle.textContent = 'Delete Doubt Photo?';
    el.confirmModalBody.textContent = `Are you sure you want to permanently delete "${name}"? The image file will be removed from local storage.`;
    el.executeConfirmBtn.textContent = 'Delete';
    el.confirmModal.hidden = false;
  }

  function promptDeleteAll() {
    if (state.photos.length === 0) return;
    state.pendingDeleteTarget = 'ALL';
    el.confirmModalTitle.textContent = 'Clear All Photos?';
    el.confirmModalBody.textContent = `Are you sure you want to clear all ${state.photos.length} uploaded photos from local storage?`;
    el.executeConfirmBtn.textContent = 'Clear All';
    el.confirmModal.hidden = false;
  }

  function executePendingDelete() {
    const target = state.pendingDeleteTarget;
    el.confirmModal.hidden = true;
    state.pendingDeleteTarget = null;
    if (target === 'ALL') deleteAllPhotos();
    else if (target) deletePhoto(target);
  }

  // Upload UI Helpers
  function showUploadProgress(show, message = '') {
    if (show) {
      el.progressStatus.textContent = message;
      el.progressPercent.textContent = '0%';
      el.progressBar.style.width = '0%';
      el.uploadProgressContainer.hidden = false;
    } else {
      el.uploadProgressContainer.hidden = true;
    }
  }

  function updateUploadProgress(percent, label) {
    el.progressPercent.textContent = `${percent}%`;
    el.progressBar.style.width = `${percent}%`;
    if (label) el.progressStatus.textContent = label;
  }

  // Setup Event Listeners
  function setupEventListeners() {
    el.addPhotosBtn.addEventListener('click', () => el.fileInput.click());
    
    // Dropzone click
    el.dropzone.addEventListener('click', (e) => {
      if (!e.target.closest('#uploadProgressContainer')) {
        el.fileInput.click();
      }
    });

    el.fileInput.addEventListener('change', (e) => {
      uploadFiles(e.target.files);
      el.fileInput.value = '';
    });

    // Drag & Drop
    const dropzone = el.dropzone;
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-active');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        uploadFiles(dt.files);
      }
    });

    // Search
    el.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      el.clearSearchBtn.hidden = state.searchQuery.length === 0;
      applyFilter();
    });

    el.clearSearchBtn.addEventListener('click', () => {
      el.searchInput.value = '';
      state.searchQuery = '';
      el.clearSearchBtn.hidden = true;
      applyFilter();
      el.searchInput.focus();
    });

    el.deleteAllBtn.addEventListener('click', promptDeleteAll);

    // Click storage badge to view / configure laptop backend URL (e.g. for remote frontend hosting)
    el.storageBadge.style.cursor = 'pointer';
    el.storageBadge.title = 'Click to view or configure Backend URL';
    el.storageBadge.addEventListener('click', () => {
      const current = localStorage.getItem('doubt_viewer_backend_url') || window.location.origin;
      const input = prompt(
        'Laptop Backend Configuration:\n\nIf your frontend is hosted online (e.g. on Vercel/Netlify), enter the URL where your laptop backend is reachable (e.g. http://192.168.29.160:3000 or your ngrok/Cloudflare tunnel URL):',
        current
      );
      if (input !== null) {
        const trimmed = input.trim();
        if (trimmed && trimmed !== window.location.origin) {
          localStorage.setItem('doubt_viewer_backend_url', trimmed);
          showToast(`Connected to backend: ${trimmed}`, 'success');
        } else {
          localStorage.removeItem('doubt_viewer_backend_url');
          showToast('Reset to default local origin', 'info');
        }
        fetchPhotos();
      }
    });

    // Viewer Controls
    el.viewerCloseBtn.addEventListener('click', closeViewer);
    el.viewerPrevBtn.addEventListener('click', () => navigateViewer(-1));
    el.viewerNextBtn.addEventListener('click', () => navigateViewer(1));
    el.btnZoomIn.addEventListener('click', zoomIn);
    el.btnZoomOut.addEventListener('click', zoomOut);
    el.btnResetZoom.addEventListener('click', resetViewerTransform);
    el.btnRotate.addEventListener('click', rotateClockwise);
    el.btnPreset2x.addEventListener('click', () => setZoom(2.0));
    el.btnPreset4x.addEventListener('click', () => setZoom(4.0));

    el.viewerHelpBtn.addEventListener('click', () => { el.helpModal.hidden = false; });
    el.closeHelpModal.addEventListener('click', () => { el.helpModal.hidden = true; });
    el.dismissHelpModal.addEventListener('click', () => { el.helpModal.hidden = true; });
    el.helpModal.addEventListener('click', (e) => {
      if (e.target === el.helpModal) el.helpModal.hidden = true;
    });

    el.closeConfirmModal.addEventListener('click', () => { el.confirmModal.hidden = true; });
    el.cancelConfirmBtn.addEventListener('click', () => { el.confirmModal.hidden = true; });
    el.executeConfirmBtn.addEventListener('click', executePendingDelete);
    el.confirmModal.addEventListener('click', (e) => {
      if (e.target === el.confirmModal) el.confirmModal.hidden = true;
    });

    window.addEventListener('keydown', handleKeyDown);
    setupViewerInteractions();
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    el.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  function formatFileSize(bytes) {
    if (typeof bytes !== 'number' || isNaN(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function formatDate(timestamp) {
    if (!timestamp) return '--';
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
