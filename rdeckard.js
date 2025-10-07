import * as pako from 'pako';

const MAGIC_LINE = 'RDECKARD/1\n';
const RICK = 'Rick';
const DECKARD = 'Deckard';
const WORDS_PER_LINE = 64; // For readability/streaming

/**
 * Converts an ArrayBuffer into a bit string.
 * MSB first for each byte.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function bufferToBitstring(buffer) {
    const view = new Uint8Array(buffer);
    let bitString = '';
    for (const byte of view) {
        // Convert byte to 8-bit binary string, padding with leading zeros if necessary
        bitString += byte.toString(2).padStart(8, '0');
    }
    return bitString;
}

/**
 * Converts a bit string (e.g., '0101...') back into a Uint8Array.
 * @param {string} bitString
 * @returns {Uint8Array}
 */
function bitstringToBuffer(bitString) {
    if (bitString.length % 8 !== 0) {
        // Truncate incomplete final byte if needed
        console.warn("Bitstring length is not a multiple of 8. Truncating excess bits.");
        bitString = bitString.substring(0, bitString.length - (bitString.length % 8));
    }

    const bytes = new Uint8Array(bitString.length / 8);

    for (let i = 0; i < bitString.length; i += 8) {
        const byteString = bitString.substring(i, i + 8);
        bytes[i / 8] = parseInt(byteString, 2);
    }
    return bytes;
}

/**
 * Encodes an ArrayBuffer into the .rdeckard format.
 * @param {ArrayBuffer} arrayBuffer The raw file data.
 * @param {object} metadata Contains filename, mimeType.
 * @param {boolean} compress Should the payload be compressed (deflate)?
 * @returns {Promise<string>} The .rdeckard file content.
 */
export async function encode(arrayBuffer, metadata, compress = true) {
    const originalLength = arrayBuffer.byteLength;
    let payloadBuffer = new Uint8Array(arrayBuffer);
    let compression = 'none';

    if (compress) {
        try {
            // Using deflate
            payloadBuffer = pako.deflate(payloadBuffer);
            compression = 'deflate';
        } catch (e) {
            console.error("Compression failed:", e);
            payloadBuffer = new Uint8Array(arrayBuffer);
            compression = 'none';
        }
    }

    // --- 1. Bit mapping ---
    const bitString = bufferToBitstring(payloadBuffer.buffer);
    const words = [];
    for (let i = 0; i < bitString.length; i++) {
        words.push(bitString[i] === '0' ? RICK : DECKARD);
    }

    // --- 2. Construct Payload String ---
    let payloadText = '';
    for (let i = 0; i < words.length; i++) {
        payloadText += words[i];
        if (i < words.length - 1) {
            // Add space or newline for readability/streaming simulation
            if ((i + 1) % WORDS_PER_LINE === 0) {
                payloadText += '\n';
            } else {
                payloadText += ' ';
            }
        }
    }

    // --- 3. Header Construction ---
    const header = {
        filename: metadata.filename,
        mimeType: metadata.mimeType,
        originalLength: originalLength,
        compression: compression,
        // Simple length checksum check for the compressed/raw payload
        checksum: payloadBuffer.byteLength.toString(16), 
        compressedLength: payloadBuffer.byteLength 
    };

    const headerJson = JSON.stringify(header);

    // --- 4. Final .rdeckard file assembly ---
    return MAGIC_LINE + headerJson + '\n\n' + payloadText;
}

/**
 * Decodes a .rdeckard string into an ArrayBuffer and metadata.
 * @param {string} rdeckardContent The .rdeckard file content.
 * @returns {Promise<{data: ArrayBuffer, metadata: object}>}
 */
export async function decode(rdeckardContent) {
    if (!rdeckardContent.startsWith(MAGIC_LINE)) {
        throw new Error("Invalid .rdeckard file format: Magic line missing or incorrect.");
    }

    const contentWithoutMagic = rdeckardContent.substring(MAGIC_LINE.length);
    
    // Find the blank line separating metadata and payload
    const blankLineIndex = contentWithoutMagic.indexOf('\n\n');
    if (blankLineIndex === -1) {
        throw new Error("Invalid .rdeckard file format: Missing blank line separator.");
    }

    const headerJsonString = contentWithoutMagic.substring(0, blankLineIndex).trim();
    const payloadText = contentWithoutMagic.substring(blankLineIndex + 2).trim();

    let metadata;
    try {
        metadata = JSON.parse(headerJsonString);
    } catch (e) {
        throw new Error("Could not parse JSON header: " + e.message);
    }

    // --- 1. Word Parsing ---
    // Efficiently split words while handling various whitespace/newlines
    const words = payloadText.match(/\b(Rick|Deckard)\b/g);

    if (!words || words.length === 0) {
        throw new Error("Payload is empty or contains no valid Rick/Deckard words.");
    }

    // --- 2. Bit Mapping ---
    let bitString = '';
    // Concatenate bits based on words (Rick=0, Deckard=1)
    for (const word of words) {
        bitString += (word === RICK ? '0' : '1');
    }

    // --- 3. Byte Packing ---
    let payloadBuffer = bitstringToBuffer(bitString);

    // Perform optional integrity check before decompression (on payloadBuffer size)
    if (metadata.compressedLength && payloadBuffer.byteLength !== metadata.compressedLength) {
         console.warn(`Integrity Warning: Payload byte length (${payloadBuffer.byteLength}) does not match expected compressed length (${metadata.compressedLength}). Data may be truncated or corrupted.`);
    }

    // --- 4. Decompression ---
    if (metadata.compression === 'deflate') {
        try {
            payloadBuffer = pako.inflate(payloadBuffer);
        } catch (e) {
            throw new Error("Decompression (deflate) failed: " + e.message);
        }
    }

    // Final size check against originalLength
    if (payloadBuffer.byteLength !== metadata.originalLength) {
         console.warn(`Integrity Warning: Decoded data length (${payloadBuffer.byteLength}) does not match expected original length (${metadata.originalLength}).`);
    }
    
    // Convert back to standard ArrayBuffer for return
    const dataArrayBuffer = payloadBuffer.buffer.slice(0, payloadBuffer.byteLength);

    return {
        data: dataArrayBuffer,
        metadata: metadata
    };
}

