import { Context } from "hono";
import { countUsers, countActiveUsersSince, listUsers, getDownloadStats } from "./db";

export async function adminStats(c: Context) {
  const db = c.env.DB as D1Database;
  const now = new Date();
  const startOfMonth = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
  const startOfYear = Math.floor(new Date(now.getFullYear(), 0, 1).getTime() / 1000);

  const [totalUsers, activeMonth, activeYear, dlStats] = await Promise.all([
    countUsers(db),
    countActiveUsersSince(db, startOfMonth),
    countActiveUsersSince(db, startOfYear),
    getDownloadStats(db, startOfMonth, startOfYear),
  ]);

  return c.json({
    total_users: totalUsers,
    active_this_month: activeMonth,
    active_this_year: activeYear,
    total_downloads: dlStats.total,
    downloads_this_month: dlStats.month,
    downloads_this_year: dlStats.year,
  });
}

export async function adminUsers(c: Context) {
  const db = c.env.DB as D1Database;
  const users = await listUsers(db);
  return c.json(users);
}
