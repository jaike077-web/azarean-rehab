import { embedFromUrl, toEmbedUrl, toThumbnailUrl } from './videoEmbed';

describe('embedFromUrl', () => {
  it('пустое/невалидное → null', () => {
    expect(embedFromUrl('')).toBeNull();
    expect(embedFromUrl(null)).toBeNull();
    expect(embedFromUrl('   ')).toBeNull();
  });

  it('Kinescope watch/video/готовый embed', () => {
    expect(embedFromUrl('https://kinescope.io/abc123XYZ')).toBe('https://kinescope.io/embed/abc123XYZ');
    expect(embedFromUrl('https://kinescope.io/watch/abc123XYZ')).toBe('https://kinescope.io/embed/abc123XYZ');
    expect(embedFromUrl('https://kinescope.io/embed/abc123XYZ')).toBe('https://kinescope.io/embed/abc123XYZ');
  });

  it('YouTube watch / youtu.be / shorts → embed', () => {
    expect(embedFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(embedFromUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(embedFromUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    // параметр v не первый
    expect(embedFromUrl('https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('VK Video → external player', () => {
    expect(embedFromUrl('https://vk.com/video-12345_678')).toBe('https://vk.com/video_ext.php?oid=-12345&id=678&hd=2');
    expect(embedFromUrl('https://vkvideo.ru/video-12345_678')).toBe('https://vk.com/video_ext.php?oid=-12345&id=678&hd=2');
    expect(embedFromUrl('https://vk.com/video_ext.php?oid=-1&id=2&hd=2')).toBe('https://vk.com/video_ext.php?oid=-1&id=2&hd=2');
  });

  it('Rutube → play/embed', () => {
    expect(embedFromUrl('https://rutube.ru/video/abcdef0123456789abcdef0123456789/')).toBe('https://rutube.ru/play/embed/abcdef0123456789abcdef0123456789');
  });

  it('прямой файл / неизвестный хост → как есть', () => {
    expect(embedFromUrl('https://cdn.example.com/clip.mp4')).toBe('https://cdn.example.com/clip.mp4');
  });
});

describe('toEmbedUrl', () => {
  it('kinescope_id приоритетнее video_url', () => {
    expect(toEmbedUrl({ kinescope_id: 'KID', video_url: 'https://youtu.be/dQw4w9WgXcQ' }))
      .toBe('https://kinescope.io/embed/KID');
  });
  it('fallback на video_url', () => {
    expect(toEmbedUrl({ video_url: 'https://youtu.be/dQw4w9WgXcQ' })).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });
  it('нет видео → null', () => {
    expect(toEmbedUrl({})).toBeNull();
    expect(toEmbedUrl(null)).toBeNull();
  });
});

describe('toThumbnailUrl', () => {
  it('сохранённый thumbnail_url приоритетнее', () => {
    expect(toThumbnailUrl({ thumbnail_url: 'https://x/p.jpg', kinescope_id: 'KID' })).toBe('https://x/p.jpg');
  });
  it('Kinescope/YouTube постер', () => {
    expect(toThumbnailUrl({ kinescope_id: 'KID' })).toBe('https://kinescope.io/preview/KID/poster');
    expect(toThumbnailUrl({ video_url: 'https://youtu.be/dQw4w9WgXcQ' })).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
  });
  it('VK / нет видео → null', () => {
    expect(toThumbnailUrl({ video_url: 'https://vk.com/video-1_2' })).toBeNull();
    expect(toThumbnailUrl({})).toBeNull();
  });
});
