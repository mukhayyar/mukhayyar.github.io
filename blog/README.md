# Blog CMS

Write markdown, push, published.

## Add a post

1. Create `blog/your-slug.md` (markdown file)
2. Add entry to `blog/posts.json`:
```json
{
  "slug": "your-slug",
  "title": "Your Post Title",
  "date": "2026-01-15",
  "tags": ["Tag1", "Tag2"],
  "cover": "",
  "excerpt": "Short description shown in card."
}
```
3. Push to GitHub. Done.

## Images

Put images in `blog/images/`. Reference in markdown:
```md
![alt text](my-image.png)
```
Auto-resolves to `blog/images/my-image.png`.

Every image is drawn as a halftone (dots) to match the site; hover shows the
original photo, and the alt text becomes the caption. Strong orange/red areas
pick up the accent colour.

## Cover

`"cover": "photo.png"` in `posts.json` renders that image as the halftone
header of the post. Leave it `""` and a generated dot illustration is picked
from the post's title and tags (antenna, rocket, CanSat, …).

## Sharing (WhatsApp, LinkedIn, X, Telegram, Facebook, Discord, Slack …)

Share a post with its own page: `https://mukhayyar.my.id/blog/your-slug/`

That page has the post's own title, excerpt and card image, so chat apps and social sites show a
proper preview. It is generated — with `blog/your-slug/og.png` and the sitemap — by
`tools/og/build.mjs`, which the **Social cards** GitHub Action runs automatically on every push
that touches `blog/`. To build locally: `npm install --prefix tools/og && node tools/og/build.mjs`.

The article view on the home page (`/#/blog/your-slug`) has share buttons that use the same link.
WhatsApp and Facebook cache previews; after changing a card, re-check with the
[Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/).

## Delete a post

Remove entry from `posts.json` + delete `.md` file. Push.

## Structure

```
blog/
  posts.json       <- post registry (add/remove here)
  your-slug.md     <- markdown content
  images/          <- post images
    photo.png
  README.md        <- this file
```
