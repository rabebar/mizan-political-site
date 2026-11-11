async function getGitHubAnalyticsSummary() {
  const events = await getGitHubAnalyticsEvents();
  if (!events.length) {
    return emptyAnalytics();
  }

  const news = await getGitHubNews();
  const newsById = new Map(news.map((item) => [String(item.id), item]));

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const totals = {
    total: events.length,
    last24h: events.filter((event) => Number(event.created_at) >= now - day).length,
    last7d: events.filter((event) => Number(event.created_at) >= now - 7 * day).length,
    last30d: events.filter((event) => Number(event.created_at) >= now - 30 * day).length
  };

  const postMap = new Map();
  for (const event of events) {
    if (!event.post_id) continue;
    const postId = String(event.post_id);
    const article = newsById.get(postId);
    const existing = postMap.get(postId) || {
      id: postId,
      title: article?.title || postId,
      category: article?.category || event.category || "home",
      visits: 0
    };
    existing.visits += 1;
    if (article?.category) existing.category = article.category;
    if (article?.title) existing.title = article.title;
    postMap.set(postId, existing);
  }

  const topPosts = Array.from(postMap.values())
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 8)
    .map((item) => ({ ...item, visits: Number(item.visits) }));

  const categoryMap = new Map();
  for (const event of events) {
    const category = event.category || "home";
    categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
  }

  const categories = Array.from(categoryMap.entries())
    .map(([category, visits]) => ({ category, visits }))
    .sort((a, b) => b.visits - a.visits);

  return { totals, topPosts, categories };
}
