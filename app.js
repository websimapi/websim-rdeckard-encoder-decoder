import { encode, decode } from 'rdeckard';

// --- UI Element Selectors ---
const switchToEncodeBtn = document.getElementById('switchToEncode');
const switchToDecodeBtn = document.getElementById('switchToDecode');
const encoderPanel = document.getElementById('encoder-panel');
const decoderPanel = document.getElementById('decoder-panel');

// Encoder elements
const fileDropArea = document.getElementById('file-drop-area');
const fileBrowseButton = document.getElementById('file-browse-button');
const fileSelectionInfo = document.getElementById('file-selection-info');
const compressToggle = document.getElementById('compressToggle');
const encodeButton = document.getElementById('encodeButton');
const encodeStatus = document.getElementById('encode-status');

// Decoder elements
const rdeckardInput = document.getElementById('rdeckardInput');
const rdeckardFileInput = document.getElementById('rdeckardFileInput');
const decodeButton = document.getElementById('decodeButton');
const decodeStatus = document.getElementById('decode-status');
const decodedOutput = document.getElementById('decodedOutput');

let currentFile = null;

// --- Helper Functions ---
const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// --- Mode Switcher Logic ---
function switchMode(mode) {
    if (mode === 'encode') {
        encoderPanel.classList.add('active');
        decoderPanel.classList.remove('active');
        switchToEncodeBtn.classList.add('active');
        switchToDecodeBtn.classList.remove('active');
    } else {
        encoderPanel.classList.remove('active');
        decoderPanel.classList.add('active');
        switchToEncodeBtn.classList.remove('active');
        switchToDecodeBtn.classList.add('active');
    }
}
switchToEncodeBtn.addEventListener('click', () => switchMode('encode'));
switchToDecodeBtn.addEventListener('click', () => switchMode('decode'));


// --- Encoder Logic ---
function handleFileSelect(file) {
    if (!file) return;
    currentFile = file;
    fileSelectionInfo.textContent = `Selected: ${currentFile.name} (${formatBytes(currentFile.size)})`;
    fileSelectionInfo.style.display = 'block';
    encodeButton.disabled = false;
    encodeStatus.innerHTML = `Ready to encode.`;
}

fileBrowseButton.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e) => handleFileSelect(e.target.files[0]);
    input.click();
});

// Allow clicking the drop area to open the file picker
fileDropArea.addEventListener('click', (e) => {
    // Don't trigger if the browse button was clicked (it has its own handler)
    if (e.target === fileBrowseButton) return;
    fileInput.click();
});

// Drag and drop for encoder
fileDropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileDropArea.classList.add('drag-over');
});
fileDropArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileDropArea.classList.remove('drag-over');
});
fileDropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileDropArea.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileSelect(files[0]);
    }
});

encodeButton.addEventListener('click', async () => {
    if (!currentFile) return;

    encodeButton.disabled = true;
    encodeStatus.innerHTML = `Encoding... This may take a while for large files.`;
    
    // Use a timeout to allow the UI to update before the heavy work starts
    setTimeout(async () => {
        try {
            const arrayBuffer = await currentFile.arrayBuffer();
            const compress = compressToggle.checked;
            
            const metadata = {
                filename: currentFile.name,
                mimeType: currentFile.type || 'application/octet-stream'
            };

            const originalSize = arrayBuffer.byteLength;
            const startTime = performance.now();
            const rdeckardContent = await encode(arrayBuffer, metadata, compress);
            const duration = (performance.now() - startTime).toFixed(2);
            
            const rdeckardSize = new Blob([rdeckardContent]).size;
            const expansionFactor = (rdeckardSize / originalSize).toFixed(1);

            const rdeckardBlob = new Blob([rdeckardContent], { type: 'text/plain' });
            const url = URL.createObjectURL(rdeckardBlob);
            
            encodeStatus.innerHTML = 
                `Done in ${duration} ms. Original: ${formatBytes(originalSize)}, .rdeckard: ${formatBytes(rdeckardSize)} (${expansionFactor}x). `+
                `<a id="downloadRdeckard" href="${url}" download="${metadata.filename}.rdeckard">Download File</a>`;
            
            // Auto-fill decoder if content is small enough
            if (rdeckardContent.length < 250000) { 
                 rdeckardInput.value = rdeckardContent;
                 checkDecodeReady();
            } else {
                 rdeckardInput.value = `Content too large (${formatBytes(rdeckardSize)}) to display. Please download and re-upload to decode.`;
            }

        } catch (error) {
            encodeStatus.innerHTML = `<span style="color:var(--accent-color)">Encoding failed: ${error.message}</span>`;
            console.error(error);
        } finally {
            encodeButton.disabled = false;
        }
    }, 10);
});


// --- Decoder Logic ---
function checkDecodeReady() {
    decodeButton.disabled = !rdeckardInput.value.trim().startsWith('RDECKARD/1');
}

rdeckardInput.addEventListener('input', checkDecodeReady);

// Use textarea as a drop target as well for .rdeckard files
rdeckardInput.addEventListener('dragover', (e) => e.preventDefault());
rdeckardInput.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.rdeckard') || file.type === 'text/plain')) {
        const reader = new FileReader();
        reader.onload = (event) => {
            rdeckardInput.value = event.target.result;
            checkDecodeReady();
        };
        reader.readAsText(file);
    }
});


decodeButton.addEventListener('click', async () => {
    const rdeckardContent = rdeckardInput.value.trim();
    if (!rdeckardContent) return;

    decodeButton.disabled = true;
    decodeStatus.innerHTML = 'Decoding... (Checking for Ricks and Deckards)';
    decodedOutput.innerHTML = '<p>Processing...</p>';

    // Use a timeout to allow UI to update
    setTimeout(async () => {
        try {
            const startTime = performance.now();
            const { data, metadata } = await decode(rdeckardContent);
            const duration = (performance.now() - startTime).toFixed(2);

            decodeStatus.innerHTML = 
                `Done in ${duration} ms. Decoded: <strong>${metadata.filename}</strong>. ` +
                `Restored Size: ${formatBytes(data.byteLength)}.`;
            
            displayDecodedContent(data, metadata);

        } catch (error) {
            decodeStatus.innerHTML = `<span style="color:var(--accent-color)">Decoding failed: ${error.message}</span>`;
            decodedOutput.innerHTML = `<p style="color: var(--accent-color);">Error: ${error.message}</p>`;
            console.error(error);
        } finally {
            decodeButton.disabled = false;
        }
    }, 10);
});

function displayDecodedContent(data, metadata) {
    decodedOutput.innerHTML = ''; 

    const mime = metadata.mimeType || 'application/octet-stream';
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    
    const sizeInBytes = data.byteLength;
    let previewGenerated = false;

    if (sizeInBytes > 0) {
        if (mime.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = url;
            img.alt = metadata.filename;
            decodedOutput.appendChild(img);
            previewGenerated = true;
        } else if (mime.startsWith('video/')) {
            const video = document.createElement('video');
            video.src = url;
            video.controls = true;
            decodedOutput.appendChild(video);
            previewGenerated = true;
        } else if (mime.startsWith('audio/')) {
            const audio = document.createElement('audio');
            audio.src = url;
            audio.controls = true;
            decodedOutput.appendChild(audio);
            previewGenerated = true;
        }
    }
    
    if (!previewGenerated) {
        decodedOutput.innerHTML = `<p>File type (${mime}) cannot be previewed directly.</p>`;
    }
    
    if (sizeInBytes === 0 && !previewGenerated) {
        decodedOutput.innerHTML = `<p>Decoded payload was empty or zero bytes.</p>`;
    }

    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = metadata.filename;
    downloadLink.textContent = `Download Decoded File: ${metadata.filename} (${formatBytes(sizeInBytes)})`;
    decodedOutput.appendChild(downloadLink);
}

// --- Initial State ---
switchMode('encode');
checkDecodeReady();