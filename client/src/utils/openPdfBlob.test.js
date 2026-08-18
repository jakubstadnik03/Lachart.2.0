/**
 * The bug this covers: inside the iOS app the "Open full PDF" button did
 * nothing at all. Every branch here must end in something the user can see —
 * a share sheet, a tab, or a download — or throw so the caller can say why.
 */
import { canShareFiles, makePdfFile, openPdfBlob } from './openPdfBlob';

const blob = () => new Blob(['%PDF-1.4'], { type: 'application/pdf' });

/** iOS WKWebView: no usable window.open, but Web Share takes files. */
const iosNav = (share = jest.fn().mockResolvedValue(undefined)) => ({
  share,
  canShare: (payload) => Array.isArray(payload?.files) && payload.files.length > 0,
});

const deskNav = () => ({}); // no Web Share at all

describe('canShareFiles', () => {
  it('is false when the platform has no Web Share', () => {
    expect(canShareFiles(makePdfFile(blob()), deskNav())).toBe(false);
  });

  it('is false when canShare throws instead of returning false', () => {
    const nav = { share: jest.fn(), canShare: () => { throw new TypeError('nope'); } };
    expect(canShareFiles(makePdfFile(blob()), nav)).toBe(false);
  });

  it('is false without a file', () => {
    expect(canShareFiles(null, iosNav())).toBe(false);
  });

  it('is true on a platform that takes files', () => {
    expect(canShareFiles(makePdfFile(blob()), iosNav())).toBe(true);
  });
});

describe('openPdfBlob', () => {
  it('hands the PDF to the OS sheet when it can', async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    const open = jest.fn();
    const res = await openPdfBlob(blob(), 'lachart-report-2026-03-09.pdf', {
      navigator: iosNav(share),
      window: { open, URL: { createObjectURL: () => 'blob:x' } },
    });
    expect(res).toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    const payload = share.mock.calls[0][0];
    expect(payload.files[0].name).toBe('lachart-report-2026-03-09.pdf');
    expect(payload.files[0].type).toBe('application/pdf');
    // A tab is never attempted on this path — that is what used to fail.
    expect(open).not.toHaveBeenCalled();
  });

  it('opens a tab on a desktop browser', async () => {
    const open = jest.fn(() => ({}));
    const res = await openPdfBlob(blob(), 'r.pdf', {
      navigator: deskNav(),
      window: { open, URL: { createObjectURL: () => 'blob:abc' } },
    });
    expect(res).toBe('opened');
    expect(open).toHaveBeenCalledWith('blob:abc', '_blank', 'noopener');
  });

  it('falls back to a download when the pop-up is blocked', async () => {
    const link = { setAttribute: jest.fn(), click: jest.fn(), remove: jest.fn() };
    const doc = { createElement: () => link, body: { appendChild: jest.fn() } };
    const res = await openPdfBlob(blob(), 'r.pdf', {
      navigator: deskNav(),
      window: { open: () => null, URL: { createObjectURL: () => 'blob:abc' } },
      document: doc,
    });
    expect(res).toBe('downloaded');
    expect(link.setAttribute).toHaveBeenCalledWith('download', 'r.pdf');
    expect(link.click).toHaveBeenCalled();
  });

  it('lets a dismissed share sheet surface as AbortError', async () => {
    const err = new Error('cancelled');
    err.name = 'AbortError';
    await expect(openPdfBlob(blob(), 'r.pdf', {
      navigator: iosNav(jest.fn().mockRejectedValue(err)),
      window: { open: jest.fn(), URL: { createObjectURL: () => 'blob:x' } },
    })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('reuses an object URL the caller already made', async () => {
    const open = jest.fn(() => ({}));
    const createObjectURL = jest.fn();
    await openPdfBlob(blob(), 'r.pdf', {
      navigator: deskNav(),
      window: { open, URL: { createObjectURL } },
      url: 'blob:already-made',
    });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith('blob:already-made', '_blank', 'noopener');
  });

  it('says so rather than failing silently when there is nothing to open', async () => {
    await expect(openPdfBlob(null, 'r.pdf', {})).rejects.toThrow(/No PDF/);
  });
});
