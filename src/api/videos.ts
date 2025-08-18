import { respondWithJSON } from './json';

import { type ApiConfig } from '../config';
import { file, s3, S3Client, type BunRequest } from 'bun';
import { BadRequestError, UserForbiddenError } from './errors';
import { getBearerToken, validateJWT } from '../auth';
import { getVideo, updateVideo } from '../db/videos';
import crypto from 'node:crypto';
import path from 'node:path';
import { rm, unlink } from 'node:fs/promises';
import { uploadVideoToS3 } from '../s3';

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const MAX_UPLOAD_SIZE = 1 << 30; // 1 GB
  const { videoId } = req.params as { videoId?: string };

  if (!videoId) {
    throw new BadRequestError('Invalid video ID');
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new BadRequestError("Couldn't find video");
  }

  if (userID !== video.userID) {
    throw new UserForbiddenError(
      'You are not allowed to upload a video for this user'
    );
  }

  const formData = await req.formData();
  const videoFile = formData.get('video');

  if (!(videoFile instanceof File)) {
    throw new BadRequestError('Video file missing');
  }

  if (videoFile.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError('Video file too large');
  }

  if (videoFile.type !== 'video/mp4') {
    throw new BadRequestError('Video file must be in MP4 format');
  }

  const filename = crypto.randomBytes(32).toString('hex');
  const fileExtension = videoFile.type.split('/')[1];

  const tempFilePath = path.join('/tmp', `${filename}.${fileExtension}`);
  await Bun.write(tempFilePath, videoFile);

  const s3Key = `${filename}.${fileExtension}`;
  await uploadVideoToS3(cfg, s3Key, tempFilePath, videoFile.type);

  // Update video URL in the database
  const newVideoURL = `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${s3Key}`;
  video.videoURL = newVideoURL;
  updateVideo(cfg.db, video);

  // Clean up temporary file
  await Promise.all([rm(tempFilePath, { force: true })]);

  return respondWithJSON(200, video);
}
