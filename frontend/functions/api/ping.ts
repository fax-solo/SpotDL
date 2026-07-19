export const onRequest: PagesFunction<{ LATEST_APP_VERSION?: string }> = async (context) => {
  const latestVersion = context.env.LATEST_APP_VERSION || null
  return new Response(JSON.stringify({
    ok: true,
    version: latestVersion,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
