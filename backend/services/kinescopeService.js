const axios = require('axios');
const config = require('../config/config');

const kinescopeApi = axios.create({
  baseURL: config.kinescope.apiUrl,
  headers: {
    Authorization: `Bearer ${config.kinescope.apiKey}`,
    'Content-Type': 'application/json',
  },
});

const getErrorMessage = (error) => {
  if (error.response?.data) {
    return JSON.stringify(error.response.data);
  }
  return error.message;
};

const ensureConfig = () => {
  if (!config.kinescope.apiKey || !config.kinescope.projectId) {
    throw new Error('Kinescope API credentials are not configured');
  }
};

/**
 * Fetch videos from Kinescope project with pagination
 */
async function fetchVideos(page = 1, perPage = 50) {
  ensureConfig();

  try {
    const response = await kinescopeApi.get('/videos', {
      params: {
        project_id: config.kinescope.projectId,
        page,
        per_page: perPage,
      },
    });

    return {
      videos: response.data?.data || [],
      pagination: response.data?.pagination || {},
    };
  } catch (error) {
    console.error('Kinescope API error:', getErrorMessage(error));
    throw new Error('Failed to fetch videos from Kinescope');
  }
}

/**
 * Fetch all videos with pagination
 */
async function fetchAllVideos() {
  ensureConfig();

  let allVideos = [];
  let currentPage = 1;
  let hasMore = true;

  while (hasMore) {
    // eslint-disable-next-line no-await-in-loop
    const { videos, pagination } = await fetchVideos(currentPage, 50);
    allVideos = allVideos.concat(videos);

    const totalPages = pagination.total_pages || 0;
    const current = pagination.current_page || currentPage;
    hasMore = totalPages ? current < totalPages : false;
    currentPage += 1;
  }

  return allVideos;
}

/**
 * Get video details by ID
 */
async function getVideoDetails(videoId) {
  ensureConfig();

  try {
    const response = await kinescopeApi.get(`/videos/${videoId}`);
    return response.data?.data;
  } catch (error) {
    console.error('Error fetching video details:', getErrorMessage(error));
    throw new Error('Failed to fetch video details');
  }
}

/**
 * Transform Kinescope video to exercise format
 */
function transformToExercise(kinescopeVideo) {
  return {
    title: kinescopeVideo?.title || 'Без названия',
    video_url: kinescopeVideo?.play_link || '',
    thumbnail_url: kinescopeVideo?.thumbnail || null,
    kinescope_id: kinescopeVideo?.id,
    duration_seconds: kinescopeVideo?.duration || null,
    body_region: null,
    exercise_type: null,
    difficulty_level: 2,
    equipment: null,
    description: kinescopeVideo?.description || null,
    instructions: null,
    contraindications: null,
    tips: null,
  };
}

module.exports = {
  fetchVideos,
  fetchAllVideos,
  getVideoDetails,
  transformToExercise,
};
