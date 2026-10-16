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

## Direct links

Share posts via: `https://mukhayyar.my.id/#/blog/your-slug`

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
