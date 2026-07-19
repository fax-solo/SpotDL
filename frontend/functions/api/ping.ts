export const onRequest: PagesFunction = async () => {
  return new Response('pong', { status: 200 })
}
