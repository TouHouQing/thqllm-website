import { open } from 'node:fs/promises';

export async function readBoundedRegularFile(
  filePath,
  { description, maxBytes, openFile = open, stats },
) {
  if (stats.size > maxBytes) {
    throw new Error(
      `${description} exceeds maximum ${maxBytes} bytes; stat reported ${stats.size} bytes.`,
    );
  }

  const buffer = Buffer.allocUnsafe(maxBytes + 1);
  const fileHandle = await openFile(filePath, 'r');
  let totalBytesRead = 0;

  try {
    while (totalBytesRead < buffer.length) {
      const remainingBytes = buffer.length - totalBytesRead;
      const { bytesRead } = await fileHandle.read(
        buffer,
        totalBytesRead,
        remainingBytes,
        totalBytesRead,
      );

      if (bytesRead === 0) {
        break;
      }

      totalBytesRead += bytesRead;
    }
  } finally {
    await fileHandle.close();
  }

  if (totalBytesRead > maxBytes) {
    throw new Error(
      `${description} exceeds maximum ${maxBytes} bytes; found at least ${totalBytesRead} bytes while reading.`,
    );
  }

  return Buffer.from(buffer.subarray(0, totalBytesRead));
}
