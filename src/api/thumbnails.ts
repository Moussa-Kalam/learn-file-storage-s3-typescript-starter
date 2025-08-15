import { getBearerToken, validateJWT } from '../auth';
import { respondWithJSON } from './json';
import { getVideo, updateVideo } from '../db/videos';
import type { ApiConfig } from '../config';
import type { BunRequest } from 'bun';
import { BadRequestError, NotFoundError, UserForbiddenError } from './errors';

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

  const imageData = Buffer.from(await file.arrayBuffer()).toString('base64');
  const dataURL = `data:${imageMediaType};base64,${imageData}`;

  const video = getVideo(cfg.db, videoId);

  if (video?.userID !== userID) {
    throw new UserForbiddenError(
      'You are not allowed to upload a thumbnail for this video'
    );
  }

  video.thumbnailURL = dataURL;
  updateVideo(cfg.db, video);

  return respondWithJSON(200, video);
}

function generateThumbnailURL(cfg: ApiConfig, videoId: string) {
  return `http://localhost:${cfg.port}/api/thumbnails/${videoId}`;
}
