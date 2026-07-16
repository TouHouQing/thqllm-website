export const visibleAlphaThreshold = 16;
export const meaningfulPixelDeltaThreshold = 16;

export function premultiplyColorChannel(value, alpha) {
  return Math.round((value * alpha) / 255);
}

function findHistogramMedian(histogram, valueCount) {
  const medianRank = Math.floor((valueCount - 1) / 2);
  let valuesSeen = 0;

  for (let value = 0; value < histogram.length; value += 1) {
    valuesSeen += histogram[value];

    if (valuesSeen > medianRank) {
      return value;
    }
  }

  throw new Error('Could not calculate an RGBA histogram median.');
}

export function analyzeRgbaContent(data, channels) {
  if (channels !== 4 || data.length % channels !== 0) {
    throw new Error(`Expected decoded sRGB RGBA pixels; found ${channels} channels.`);
  }

  if (data.length === 0) {
    throw new Error('Expected at least one decoded sRGB RGBA pixel.');
  }

  const totalPixels = data.length / channels;
  const histograms = Array.from({ length: channels }, () => new Uint32Array(256));
  const minima = Array(channels).fill(255);
  const maxima = Array(channels).fill(0);
  const means = Array(channels).fill(0);
  const squaredDifferences = Array(channels).fill(0);
  let alphaSum = 0;
  let visiblePixels = 0;

  for (
    let offset = 0, pixelNumber = 1;
    offset < data.length;
    offset += channels, pixelNumber += 1
  ) {
    const alpha = data[offset + 3];
    alphaSum += alpha;

    if (alpha >= visibleAlphaThreshold) {
      visiblePixels += 1;
    }

    for (let channel = 0; channel < channels; channel += 1) {
      const value = channel === 3 ? alpha : premultiplyColorChannel(data[offset + channel], alpha);
      histograms[channel][value] += 1;
      minima[channel] = Math.min(minima[channel], value);
      maxima[channel] = Math.max(maxima[channel], value);
      const delta = value - means[channel];
      means[channel] += delta / pixelNumber;
      squaredDifferences[channel] += delta * (value - means[channel]);
    }
  }

  const channelMedians = histograms.map((histogram) => findHistogramMedian(histogram, totalPixels));
  let meaningfulPixels = 0;

  for (let offset = 0; offset < data.length; offset += channels) {
    const alpha = data[offset + 3];
    let maximumDelta = 0;

    for (let channel = 0; channel < channels; channel += 1) {
      const value = channel === 3 ? alpha : premultiplyColorChannel(data[offset + channel], alpha);
      maximumDelta = Math.max(maximumDelta, Math.abs(value - channelMedians[channel]));
    }

    if (maximumDelta >= meaningfulPixelDeltaThreshold) {
      meaningfulPixels += 1;
    }
  }

  const channelRanges = maxima.map((maximum, index) => maximum - minima[index]);
  const channelStandardDeviations = squaredDifferences.map((sum) => Math.sqrt(sum / totalPixels));

  return {
    alphaCoverageRatio: alphaSum / 255 / totalPixels,
    channelMedians,
    channelRanges,
    channelStandardDeviations,
    meaningfulPixelRatio: meaningfulPixels / totalPixels,
    visiblePixelRatio: visiblePixels / totalPixels,
  };
}
