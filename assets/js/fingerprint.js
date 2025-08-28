async function gatherFingerprintData() {
    const fingerprint = {};

    // --- Screen Resolution ---
    try {
        fingerprint.screenResolution = {
            width: screen.width,
            height: screen.height,
            devicePixelRatio: window.devicePixelRatio,
            colorDepth: screen.colorDepth,
            pixelDepth: screen.pixelDepth,
            availWidth: screen.availWidth,
            availHeight: screen.availHeight
        };
    } catch (e) {
        fingerprint.screenResolution = `Error: ${e.message}`;
    }

    fingerprint.fonts = 'Standard APIs cannot list all fonts. Check common fonts individually if needed.';

    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const txt = 'BrowserFingerprint_9.876543210_!@#$%^&*()_+~`{}|[]\\:;"\'<>,.?/';
            ctx.textBaseline = "top";
            ctx.font = "14px 'Arial'";
            ctx.textBaseline = "alphabetic";
            ctx.fillStyle = "#f60";
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = "#069";
            ctx.fillText(txt, 2, 15);
            ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
            ctx.fillText(txt, 4, 17);
            fingerprint.canvasFingerprint = canvas.toDataURL();
        } else {
             fingerprint.canvasFingerprint = 'Canvas 2D context not available';
        }
    } catch (e) {
        fingerprint.canvasFingerprint = `Error: ${e.message}`;
    }

    // --- WebGL ---
    try {
        const canvas = document.createElement('canvas');
        let gl = canvas.getContext('webgl2');
        let webGLVersion = 'WebGL 2';
        if (!gl) {
            gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            webGLVersion = 'WebGL 1';
            if (!gl) {
                webGLVersion = 'None';
            }
        }

        if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            fingerprint.webGL = {
                contextVersion: webGLVersion,
                vendor: gl.getParameter(gl.VENDOR),
                renderer: gl.getParameter(gl.RENDERER),
                unmaskedVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'N/A',
                unmaskedRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'N/A',
                version: gl.getParameter(gl.VERSION),
                shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
                // Add more parameters for potential differentiation
                maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
                maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
                aliasedLineWidthRange: gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE),
                aliasedPointSizeRange: gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE),
                // Shader precision (might vary)
                vertexShaderBestFloatPrecision: getShaderPrecisionFormat(gl, gl.VERTEX_SHADER, gl.HIGH_FLOAT),
                fragmentShaderBestFloatPrecision: getShaderPrecisionFormat(gl, gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)
            };
        } else {
            fingerprint.webGL = { contextVersion: webGLVersion, error: 'WebGL context could not be created' };
        }
    } catch (e) {
        fingerprint.webGL = `Error: ${e.message}`;
    }

    // --- User Agent ---
    try {
        fingerprint.userAgent = navigator.userAgent;
    } catch (e) {
        fingerprint.userAgent = `Error: ${e.message}`;
    }

    // --- Platform ---
    try {
        fingerprint.platform = navigator.platform;
    } catch (e) {
        fingerprint.platform = `Error: ${e.message}`;
    }

    // --- Language ---
    try {
        fingerprint.language = navigator.language;
        fingerprint.languages = navigator.languages;
    } catch (e) {
        fingerprint.language = `Error: ${e.message}`;
    }

    // --- Timezone ---
    try {
        fingerprint.timezoneOffset = new Date().getTimezoneOffset();
        fingerprint.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) {
        fingerprint.timezone = `Error: ${e.message}`;
    }

    // Send fingerprint data to server via socket.io
    try {
        if (typeof socket !== 'undefined' && socket) {socket.emit('save_fingerprint', fingerprint);} else {return;}
    } catch (e) {return;}
    return fingerprint;
}

// Helper function to get shader precision details
function getShaderPrecisionFormat(gl, shaderType, precisionType) {
    try {
        const format = gl.getShaderPrecisionFormat(shaderType, precisionType);
        if (!format) return 'N/A';
        return {
            rangeMin: format.rangeMin,
            rangeMax: format.rangeMax,
            precision: format.precision
        };
    } catch (e) {
        return `Error: ${e.message}`;
    }
}

// Call the function when the page loads
document.addEventListener('DOMContentLoaded', function() {
    // Wait for socket.io to be available before gathering fingerprint data
    if (typeof io !== 'undefined') {
        const checkSocket = setInterval(function() {
            if (typeof socket !== 'undefined' && socket) {
                gatherFingerprintData();
                clearInterval(checkSocket);
            }
        }, 500);
        
        // Fallback if socket doesn't initialize within 5 seconds
        setTimeout(function() {
            clearInterval(checkSocket);
            if (typeof socket === 'undefined' || !socket) {
                console.log("Socket not initialized after timeout, gathering fingerprint anyway");
                gatherFingerprintData();
            }
        }, 5000);
    } else {
        console.log("Socket.io not available, gathering fingerprint without socket");
        gatherFingerprintData();
    }
}); 