import { asyncHandler } from '../middleware/asyncHandler.js';
import { verifyMpSignature } from '../lib/wechatMp.js';
import { handleMpBindEvent } from '../services/wxMpBind.service.js';
import { parseWechatXml } from '../utils/wxMpXml.js';

/** 微信服务器 URL 验证 */
export const verify = asyncHandler(async (req, res) => {
  const signature = String(req.query.signature ?? '');
  const timestamp = String(req.query.timestamp ?? '');
  const nonce = String(req.query.nonce ?? '');
  const echostr = String(req.query.echostr ?? '');

  if (!verifyMpSignature({ signature, timestamp, nonce })) {
    res.status(403).send('invalid signature');
    return;
  }
  res.status(200).type('text/plain').send(echostr);
});

/** 接收关注 / 扫码等事件；5 秒内必须响应 */
export const receive = asyncHandler(async (req, res) => {
  const signature = String(req.query.signature ?? '');
  const timestamp = String(req.query.timestamp ?? '');
  const nonce = String(req.query.nonce ?? '');

  if (!verifyMpSignature({ signature, timestamp, nonce })) {
    res.status(403).send('invalid signature');
    return;
  }

  // 先回 success，再异步处理，避免微信重推
  res.status(200).type('text/plain').send('success');

  const raw = typeof req.body === 'string' ? req.body : '';
  if (!raw) return;

  try {
    const fields = parseWechatXml(raw);
    const msgType = (fields.MsgType || '').toLowerCase();
    if (msgType !== 'event') return;

    const mpOpenId = fields.FromUserName;
    const event = fields.Event;
    if (!mpOpenId || !event) return;

    const result = await handleMpBindEvent({
      mpOpenId,
      event,
      eventKey: fields.EventKey,
    });
    if (result.action === 'bound') {
      console.log('[wx-mp] bound user', result.boundUserId, 'openid', mpOpenId.slice(0, 6) + '…');
    }
  } catch (err) {
    console.warn('[wx-mp] webhook handle failed:', err);
  }
});
