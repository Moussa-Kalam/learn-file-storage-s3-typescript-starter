import { getBearerToken, validateJWT } from '../auth';
import { respondWithJSON } from './json';
import { getVideo, updateVideo } from '../db/videos';
import type { ApiConfig } from '../config';
import type { BunRequest } from 'bun';
import { BadRequestError, NotFoundError, UserForbiddenError } from './errors';
import path from 'node:path';

type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};

export async function handlerGetThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError('Invalid video ID');
  }

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }

  const thumbnail = videoThumbnails.get(videoId);
  if (!thumbnail) {
    throw new NotFoundError('Thumbnail not found');
  }

  return new Response(thumbnail.data, {
    headers: {
      'Content-Type': thumbnail.mediaType,
      'Cache-Control': 'no-store',
    },
  });
}

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError('Invalid video ID');
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log('uploading thumbnail for video', videoId, 'by user', userID);

  const formData = await req.formData();
  const file = formData.get('thumbnail');
  if (!(file instanceof File)) {
    throw new BadRequestError('Thumbnail file missing');
  }

  const MAX_UPLOAD_SIZE = 10 << 20; // 10 MB

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError('Thumbnail file too large');
  }

  const imageMediaType = file.type;
  const fileExtension = imageMediaType.split('/')[1];
  const filePath = path.join(cfg.assetsRoot, `${videoId}.${fileExtension}`);
  Bun.write(filePath, await file.arrayBuffer());

  const video = getVideo(cfg.db, videoId);

  if (video?.userID !== userID) {
    throw new UserForbiddenError(
      'You are not allowed to upload a thumbnail for this video'
    );
  }

  video.thumbnailURL = `http://localhost:${cfg.port}/assets/${videoId}.${fileExtension}`;
  updateVideo(cfg.db, video);

  return respondWithJSON(200, video);
}

function generateThumbnailURL(cfg: ApiConfig, videoId: string) {
  return `http://localhost:${cfg.port}/api/thumbnails/${videoId}`;
}
