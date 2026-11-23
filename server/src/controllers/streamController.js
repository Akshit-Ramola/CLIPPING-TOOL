import { findStreams } from "../services/youtube/streamSearch.service.js";

export async function searchStreams(req, res) {
  const { q, max } = req.validatedQuery;
  const streams = await findStreams(q, max);
  res.json({ query: q, count: streams.length, streams });
}
