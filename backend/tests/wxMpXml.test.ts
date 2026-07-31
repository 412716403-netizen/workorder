import { describe, expect, it } from 'vitest';
import { extractBindScene, parseWechatXml } from '../src/utils/wxMpXml.js';

describe('parseWechatXml', () => {
  it('parses CDATA event payload', () => {
    const xml = `
<xml>
  <ToUserName><![CDATA[gh_test]]></ToUserName>
  <FromUserName><![CDATA[oABC123]]></FromUserName>
  <CreateTime>1234567890</CreateTime>
  <MsgType><![CDATA[event]]></MsgType>
  <Event><![CDATA[subscribe]]></Event>
  <EventKey><![CDATA[qrscene_bdeadbeef]]></EventKey>
</xml>`;
    const fields = parseWechatXml(xml);
    expect(fields.FromUserName).toBe('oABC123');
    expect(fields.Event).toBe('subscribe');
    expect(fields.EventKey).toBe('qrscene_bdeadbeef');
  });
});

describe('extractBindScene', () => {
  it('strips qrscene_ prefix for subscribe', () => {
    expect(extractBindScene('qrscene_babc')).toBe('babc');
  });
  it('keeps raw scene for SCAN', () => {
    expect(extractBindScene('babc')).toBe('babc');
  });
  it('returns null for empty', () => {
    expect(extractBindScene('')).toBeNull();
    expect(extractBindScene(undefined)).toBeNull();
  });
});
