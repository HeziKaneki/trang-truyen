import sanitizeHtml from 'sanitize-html';
export function sanitize(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'h2',
      'h3',
      'strong',
      'em',
      'u',
      's',
      'ul',
      'ol',
      'li',
      'blockquote',
      'hr',
      'img',
    ],
    allowedAttributes: { img: ['src', 'alt'] },
    allowedSchemes: [],
    allowProtocolRelative: false,
    exclusiveFilter: (frame) =>
      frame.tag === 'img' &&
      !/^\/uploads\/[a-f0-9-]+(?:-thumb)?\.webp$/.test(frame.attribs.src || ''),
  });
}
export function plainText(html: string) {
  return sanitizeHtml(html.replace(/<\/(p|h[1-6]|li|blockquote)>/g, ' '), {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/&nbsp;/g, ' ')
    .trim();
}
export function content(html: string) {
  const clean = sanitize(html);
  const text = plainText(clean);
  return { html: clean, text, wordCount: text ? text.split(/\s+/).length : 0 };
}
