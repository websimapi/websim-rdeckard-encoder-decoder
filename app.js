import { encode, decode } from 'rdeckard';

const fileInput = document.getElementById('fileInput');
const compressToggle = document.getElementById('compressToggle');
const encodeButton = document.getElementById('encodeButton');
const rdeckardOutput = document.getElementById('rdeckardOutput');
const downloadRdeckard = document.getElementById('downloadRdeckard');
const encodeStats = document.getElementById('encodeStats');

const rdeckardInput = document.getElementById('rdeckardInput');
const rdeckardFileInput = document.getElementById('rdeckardFileInput');
const decodeButton = document.getElementById('decodeButton');
const decodeStats = document.getElementById('decodeStats');
const decodedOutput = document.getElementById('decodedOutput');

let currentFile = null;

// Helper to format file sizes
const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// --- Encoder Logic ---

fileInput.addEventListener('change', (e) => {
    currentFile = e.target.files[0];
    encodeButton.disabled = !currentFile;
    if (currentFile) {
        encodeStats.textContent = `Ready to encode: ${currentFile.name} (${formatBytes(currentFile.size)})`;
    }
});

encodeButton.addEventListener('click', async () => {
    if (!currentFile) return;

    encodeButton.disabled = true;
    encodeStats.textContent = 'Encoding... This might take a significant time and cause UI lag due to massive data expansion.';
    rdeckardOutput.value = '';
    downloadRdeckard.style.display = 'none';

    try {
        const reader = new FileReader();
        reader.onload = async (event) => {
            const arrayBuffer = event.target.result;
            const compress = compressToggle.checked;
            
            const metadata = {
                filename: currentFile.name,
                mimeType: currentFile.type || 'application/octet-stream'
            };

            const originalSize = arrayBuffer.byteLength;

            const startTime = performance.now();
            const rdeckardContent = await encode(arrayBuffer, metadata, compress);
            const duration = (performance.now() - startTime).toFixed(2);
            
            rdeckardOutput.value = rdeckardContent;

            const rdeckardSize = new Blob([rdeckardContent]).size;
            const expansionFactor = (rdeckardSize / originalSize).toFixed(1);

            encodeStats.textContent = 
                `Done in ${duration} ms. Original size: ${formatBytes(originalSize)}. ` +
                `.rdeckard size: ${formatBytes(rdeckardSize)} (Expansion: ${expansionFactor}x). Compression: ${compress ? 'Deflate' : 'None'}.`;
            
            // Setup download link
            const rdeckardBlob = new Blob([rdeckardContent], { type: 'text/plain' });
            const url = URL.createObjectURL(rdeckardBlob);
            downloadRdeckard.href = url;
            downloadRdeckard.download = metadata.filename + '.rdeckard';
            downloadRdeckard.textContent = `Download ${metadata.filename}.rdeckard`;
            downloadRdeckard.style.display = 'block';

            // Also populate the decoder input automatically if the file isn't gigantic
            if (rdeckardContent.length < 50000) { // Limit auto-paste to avoid UI freeze/memory issues
                 rdeckardInput.value = rdeckardContent;
            } else {
                 rdeckardInput.value = `Content too large (${formatBytes(rdeckardSize)}) to display in textarea. Download and upload/paste in chunks if necessary.`;
            }
            checkDecodeReady();
        };
        reader.readAsArrayBuffer(currentFile);

    } catch (error) {
        encodeStats.textContent = `Encoding failed: ${error.message}`;
        console.error(error);
    } finally {
        encodeButton.disabled = false;
    }
});


// --- Decoder Logic ---

function checkDecodeReady() {
    // Enable decode button if there's content in the textarea
    decodeButton.disabled = !rdeckardInput.value.trim().startsWith('RDECKARD/1');
}

rdeckardInput.addEventListener('input', checkDecodeReady);

rdeckardFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
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
    decodeStats.textContent = 'Decoding... (Checking for Ricks and Deckards)';
    decodedOutput.innerHTML = '<p>Processing...</p>';

    try {
        const startTime = performance.now();
        
        // Decoding involves heavy string manipulation and bit packing
        const { data, metadata } = await decode(rdeckardContent);
        
        const duration = (performance.now() - startTime).toFixed(2);

        decodeStats.textContent = 
            `Done in ${duration} ms. Decoded file: ${metadata.filename}. MIME: ${metadata.mimeType}. ` +
            `Restored size: ${formatBytes(data.byteLength)} (Expected: ${formatBytes(metadata.originalLength)}).`;
        
        displayDecodedContent(data, metadata);

    } catch (error) {
        decodeStats.textContent = `Decoding failed: ${error.message}`;
        decodedOutput.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
        console.error(error);
    } finally {
        decodeButton.disabled = false;
    }
});

function displayDecodedContent(data, metadata) {
    decodedOutput.innerHTML = ''; 

    const mime = metadata.mimeType || 'application/octet-stream';
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    
    const sizeInBytes = data.byteLength;

    // Try to display directly if it's displayable media
    if (sizeInBytes > 0) {
        if (mime.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = url;
            img.alt = metadata.filename;
            decodedOutput.appendChild(img);
        } else if (mime.startsWith('video/')) {
            const video = document.createElement('video');
            video.src = url;
            video.controls = true;
            decodedOutput.appendChild(video);
        } else if (mime.startsWith('audio/')) {
            const audio = document.createElement('audio');
            audio.src = url;
            audio.controls = true;
            decodedOutput.appendChild(audio);
        } else {
            decodedOutput.innerHTML = `<p>File type (${mime}) cannot be previewed directly.</p>`;
        }
    } else {
        decodedOutput.innerHTML = `<p>Decoded payload was empty or zero bytes.</p>`;
    }

    // Always provide a download link
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = metadata.filename;
    downloadLink.textContent = `Download Decoded File: ${metadata.filename} (${formatBytes(sizeInBytes)})`;
    decodedOutput.appendChild(downloadLink);
}

// Initial state check
checkDecodeReady();