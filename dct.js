// dct.js - Transformasi DCT 2D (8x8)
const N = 8;
const PI = Math.PI;

function dct2d(block) {
  const out = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let u = 0; u < N; u++) {
    for (let v = 0; v < N; v++) {
      let sum = 0;
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          sum += block[x][y]
            * Math.cos((2 * x + 1) * u * PI / (2 * N))
            * Math.cos((2 * y + 1) * v * PI / (2 * N));
        }
      }
      const cu = (u === 0) ? 1 / Math.sqrt(2) : 1;
      const cv = (v === 0) ? 1 / Math.sqrt(2) : 1;
      out[u][v] = 0.25 * cu * cv * sum;
    }
  }
  return out;
}

function idct2d(coeffs) {
  const out = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      let sum = 0;
      for (let u = 0; u < N; u++) {
        for (let v = 0; v < N; v++) {
          const cu = (u === 0) ? 1 / Math.sqrt(2) : 1;
          const cv = (v === 0) ? 1 / Math.sqrt(2) : 1;
          sum += cu * cv * coeffs[u][v]
            * Math.cos((2 * x + 1) * u * PI / (2 * N))
            * Math.cos((2 * y + 1) * v * PI / (2 * N));
        }
      }
      out[x][y] = 0.25 * sum;
    }
  }
  return out;
}

module.exports = { N, dct2d, idct2d };