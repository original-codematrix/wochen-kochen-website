// Vercel/Node serverless function. Connect PRICE_FEED_URL to an allowed JSON feed.
export default async function handler(req,res){
  const feed=process.env.PRICE_FEED_URL;
  if(!feed)return res.status(503).json({error:'PRICE_FEED_URL ist nicht konfiguriert'});
  try{
    const url=new URL(feed);
    url.searchParams.set('postalCode',req.query.postalCode||'85386');
    url.searchParams.set('marketId',req.query.marketId||'440303');
    const response=await fetch(url,{headers:{accept:'application/json'}});
    if(!response.ok)throw new Error('Preisquelle antwortet mit '+response.status);
    const data=await response.json();
    return res.status(200).json({prices:data.prices||data,source:data.source||'Konfigurierte Preisquelle',updated:data.updated||new Date().toISOString()});
  }catch(error){return res.status(502).json({error:error.message})}
}
