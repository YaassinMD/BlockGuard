import QRCode from 'qrcode';

const LOCAL_DEVELOPMENT_URL = 'http://localhost:3000';

export function getPublicAppUrl(): URL {
  const configuredUrl = process.env.APP_URL?.trim();
  let appUrl: URL;

  if (configuredUrl) {
    try {
      appUrl = new URL(configuredUrl);
    } catch {
      throw new Error('APP_URL must be a valid absolute URL.');
    }
  } else if (process.env.NODE_ENV !== 'production') {
    appUrl = new URL(LOCAL_DEVELOPMENT_URL);
  } else {
    throw new Error('APP_URL must be configured before generating product QR codes.');
  }

  const hostname = appUrl.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const isLocalHost = hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '::1'
    || /^127\./.test(hostname);
  if (process.env.NODE_ENV === 'production' && (appUrl.protocol !== 'https:' || isLocalHost)) {
    throw new Error('Production APP_URL must use HTTPS and cannot point to localhost.');
  }
  if (!['http:', 'https:'].includes(appUrl.protocol) || appUrl.username || appUrl.password) {
    throw new Error('APP_URL must be an HTTP(S) URL without embedded credentials.');
  }

  return appUrl;
}

export function createProductVerificationUrl(qrCode: string, appUrl = getPublicAppUrl()): string {
  const verificationUrl = new URL('/', appUrl);
  verificationUrl.searchParams.set('qr', qrCode);
  return verificationUrl.toString();
}

export function createProductQrImage(verificationUrl: string): Promise<string> {
  return QRCode.toDataURL(verificationUrl, {
    type: 'image/png',
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 320,
  });
}

export function createProductQrPng(verificationUrl: string): Promise<Buffer> {
  return QRCode.toBuffer(verificationUrl, {
    type: 'png',
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 320,
  });
}
