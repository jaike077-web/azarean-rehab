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

  console.log('=== KINESCOPE DEBUG ===');
  console.log('Project ID:', config.kinescope.projectId);
  console.log('Folder ID:', config.kinescope.folderId || 'ALL (entire project)');
  console.log('Page:', page);
  console.log('=======================');

  try {
    const params = {
      project_id: config.kinescope.projectId,
      page,
      per_page: perPage,
    };

    // Если указана папка — фильтруем
    if (config.kinescope.folderId) {
      params.folder_id = config.kinescope.folderId;
    }

    const response = await kinescopeApi.get('/videos', { params });

    // ИСПРАВЛЕНО: пагинация в meta.pagination
    const pagination = response.data?.meta?.pagination || {};
    
    console.log('=== RESPONSE ===');
    console.log('Videos on page:', response.data?.data?.length || 0);
    console.log('Total in project:', pagination.total || 0);
    console.log('================');

    return {
      videos: response.data?.data || [],
      pagination: {
        page: pagination.page ?? page,
        per_page: pagination.per_page ?? perPage,
        total: pagination.total ?? 0,
      },
    };
  } catch (error) {
    console.error('=== KINESCOPE ERROR ===');
    console.error('Status:', error.response?.status);
    console.error('Data:', JSON.stringify(error.response?.data, null, 2));
    console.error('=======================');
    throw new Error('Failed to fetch videos from Kinescope');
  }
}

/**
 * Fetch all videos with pagination
 */
async function fetchAllVideos() {
  ensureConfig();

  let allVideos = [];
  let page = 1;
  const perPage = 50;

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { videos, pagination } = await fetchVideos(page, perPage);
    allVideos = allVideos.concat(videos);

    const total = pagination.total || 0;
    const totalPages = total ? Math.ceil(total / perPage) : 0;

    console.log(`📄 Page ${page}/${totalPages} - Loaded ${videos.length} videos (Total so far: ${allVideos.length}/${total})`);

    if (!totalPages || page >= totalPages) break;
    page += 1;
  }

  console.log(`✅ COMPLETE: Loaded ${allVideos.length} total videos`);
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
  // Извлекаем thumbnail из правильного места
  const thumbnailUrl = kinescopeVideo?.poster?.original || 
                       kinescopeVideo?.poster?.lg || 
                       kinescopeVideo?.poster?.md ||
                       kinescopeVideo?.thumbnail ||
                       null;

  return {
    title: kinescopeVideo?.title || 'Без названия',
    video_url: kinescopeVideo?.play_link || '',
    thumbnail_url: thumbnailUrl,  // ✅ Правильно!
    kinescope_id: kinescopeVideo?.id,
    duration_seconds: kinescopeVideo?.duration ? Math.round(kinescopeVideo.duration) : null,
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
  fetchAllVideos,        // ← КРИТИЧНО! ДОЛЖНА БЫТЬ!
  getVideoDetails,
  transformToExercise,
};