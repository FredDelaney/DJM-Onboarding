#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const APPLY = process.argv.includes('--apply');
const ROOT = process.cwd();

const expectedBlobs = {
  'app/layout.tsx': 'a2e4db839aaaf1bca80ed93752451189adb49ed5',
  'lib/djm-os.ts': 'a45a5e1c59ed156830311cca76f0366327f1703d',
  'components/DjmTellDjmLauncher.tsx': '0425cb117542acf075ef8ae4599dba5275ac6d6e',
  'components/TellDjmFullPage.tsx': '5a44c8eaee350f4e985327d105e9cfe8e700888d',
  'supabase/functions/djm-tell-capture/index.ts': '0e37985c789f4c9bb71c44218342cd6080e87080',
  'supabase/functions/djm-tell-process/index.ts': 'ea4e11406129b6f6e19af1a196d78ef389c2c133',
};

const newFilesB64 = {
  "lib/djm-context.ts": "ZXhwb3J0IHR5cGUgRGptRW50aXR5Q29udGV4dCA9IHsKICByb3V0ZT86IHN0cmluZyB8IG51bGw7CiAgbGFiZWw/OiBzdHJpbmcgfCBudWxsOwogIGNvbnRleHRfdHlwZT86CiAgICB8ICdwbGF5ZXInCiAgICB8ICdjbHViJwogICAgfCAnY29udGFjdCcKICAgIHwgJ3JlY3J1aXRtZW50JwogICAgfCAnb3Bwb3J0dW5pdHknCiAgICB8IHN0cmluZwogICAgfCBudWxsOwogIG9yZ2FuaXNhdGlvbl9pZD86IHN0cmluZyB8IG51bGw7CiAgb3JnYW5pc2F0aW9uX25hbWU/OiBzdHJpbmcgfCBudWxsOwogIHBlcnNvbl9pZD86IHN0cmluZyB8IG51bGw7CiAgcGVyc29uX25hbWU/OiBzdHJpbmcgfCBudWxsOwogIHBsYXllcl9pZD86IHN0cmluZyB8IG51bGw7CiAgcGxheWVyX25hbWU/OiBzdHJpbmcgfCBudWxsOwogIHByb3NwZWN0X2lkPzogc3RyaW5nIHwgbnVsbDsKICBwcm9zcGVjdF9uYW1lPzogc3RyaW5nIHwgbnVsbDsKICBvcHBvcnR1bml0eV9pZD86IHN0cmluZyB8IG51bGw7CiAgY2x1Yl9uZWVkX2lkPzogc3RyaW5nIHwgbnVsbDsKICBuZWVkX3Bvc2l0aW9uPzogc3RyaW5nIHwgbnVsbDsKfTsKCmNvbnN0IFVVSURfU09VUkNFID0KICAnWzAtOWEtZkEtRl17OH0tWzAtOWEtZkEtRl17NH0tWzEtNV1bMC05YS1mQS1GXXszfS1bODlhYkFCXVswLTlhLWZBLUZdezN9LVswLTlhLWZBLUZdezEyfSc7CgpleHBvcnQgY29uc3QgREpNX1VVSURfUEFUVEVSTiA9IG5ldyBSZWdFeHAoYF4ke1VVSURfU09VUkNFfSRgKTsKCmNvbnN0IHJvdXRlSWQgPSAocGF0aG5hbWU6IHN0cmluZywgcm91dGU6IHN0cmluZykgPT4KICBwYXRobmFtZS5tYXRjaChuZXcgUmVnRXhwKGBeJHtyb3V0ZX0vKCR7VVVJRF9TT1VSQ0V9KSg/Oi98JClgKSk/LlsxXSB8fCBudWxsOwoKZXhwb3J0IGZ1bmN0aW9uIGNvbnRleHRGcm9tUm91dGUocGF0aG5hbWU6IHN0cmluZyk6IERqbUVudGl0eUNvbnRleHQgewogIGNvbnN0IHJvdXRlID0gcGF0aG5hbWUgfHwgJy9kam0nOwoKICBjb25zdCBwbGF5ZXJJZCA9IHJvdXRlSWQocm91dGUsICcvYWRtaW4vcGxheWVycycpOwogIGlmIChwbGF5ZXJJZCkgewogICAgcmV0dXJuIHsgcm91dGUsIHBsYXllcl9pZDogcGxheWVySWQsIGNvbnRleHRfdHlwZTogJ3BsYXllcicgfTsKICB9CgogIGNvbnN0IGNsdWJJZCA9IHJvdXRlSWQocm91dGUsICcvbmV0d29yay9jbHVicycpOwogIGlmIChjbHViSWQpIHsKICAgIHJldHVybiB7IHJvdXRlLCBvcmdhbmlzYXRpb25faWQ6IGNsdWJJZCwgY29udGV4dF90eXBlOiAnY2x1YicgfTsKICB9CgogIGNvbnN0IHBlcnNvbklkID0gcm91dGVJZChyb3V0ZSwgJy9uZXR3b3JrL2NvbnRhY3RzJyk7CiAgaWYgKHBlcnNvbklkKSB7CiAgICByZXR1cm4geyByb3V0ZSwgcGVyc29uX2lkOiBwZXJzb25JZCwgY29udGV4dF90eXBlOiAnY29udGFjdCcgfTsKICB9CgogIGNvbnN0IHByb3NwZWN0SWQgPSByb3V0ZUlkKHJvdXRlLCAnL3JlY3J1aXRtZW50Jyk7CiAgaWYgKHByb3NwZWN0SWQpIHsKICAgIHJldHVybiB7IHJvdXRlLCBwcm9zcGVjdF9pZDogcHJvc3BlY3RJZCwgY29udGV4dF90eXBlOiAncmVjcnVpdG1lbnQnIH07CiAgfQoKICBjb25zdCBvcHBvcnR1bml0eUlkID0KICAgIHJvdXRlSWQocm91dGUsICcvb3Bwb3J0dW5pdGllcycpIHx8CiAgICByb3V0ZUlkKHJvdXRlLCAnL21hcmtldC9kZWFscycpIHx8CiAgICByb3V0ZUlkKHJvdXRlLCAnL2RlYWxzJyk7CiAgaWYgKG9wcG9ydHVuaXR5SWQpIHsKICAgIHJldHVybiB7IHJvdXRlLCBvcHBvcnR1bml0eV9pZDogb3Bwb3J0dW5pdHlJZCwgY29udGV4dF90eXBlOiAnb3Bwb3J0dW5pdHknIH07CiAgfQoKICByZXR1cm4geyByb3V0ZSB9Owp9CgpleHBvcnQgZnVuY3Rpb24gbWVyZ2VEam1Db250ZXh0KAogIC4uLmNvbnRleHRzOiBBcnJheTxEam1FbnRpdHlDb250ZXh0IHwgbnVsbCB8IHVuZGVmaW5lZD4KKTogRGptRW50aXR5Q29udGV4dCB7CiAgcmV0dXJuIGNvbnRleHRzLnJlZHVjZTxEam1FbnRpdHlDb250ZXh0PigKICAgIChtZXJnZWQsIGNvbnRleHQpID0+ICh7IC4uLm1lcmdlZCwgLi4uKGNvbnRleHQgfHwge30pIH0pLAogICAge30sCiAgKTsKfQoKZXhwb3J0IGZ1bmN0aW9uIGNvbnRleHRGcm9tU2VhcmNoUGFyYW1zKAogIHBhcmFtczogVVJMU2VhcmNoUGFyYW1zLAopOiBEam1FbnRpdHlDb250ZXh0IHsKICBjb25zdCBjb250ZXh0OiBEam1FbnRpdHlDb250ZXh0ID0ge307CiAgY29uc3QgaWRLZXlzID0gbmV3IFNldChbCiAgICAnb3JnYW5pc2F0aW9uX2lkJywKICAgICdwZXJzb25faWQnLAogICAgJ3BsYXllcl9pZCcsCiAgICAncHJvc3BlY3RfaWQnLAogICAgJ29wcG9ydHVuaXR5X2lkJywKICAgICdjbHViX25lZWRfaWQnLAogIF0pOwogIGNvbnN0IGtleXMgPSBbCiAgICAnY29udGV4dF90eXBlJywKICAgICdsYWJlbCcsCiAgICAnb3JnYW5pc2F0aW9uX2lkJywKICAgICdvcmdhbmlzYXRpb25fbmFtZScsCiAgICAncGVyc29uX2lkJywKICAgICdwZXJzb25fbmFtZScsCiAgICAncGxheWVyX2lkJywKICAgICdwbGF5ZXJfbmFtZScsCiAgICAncHJvc3BlY3RfaWQnLAogICAgJ3Byb3NwZWN0X25hbWUnLAogICAgJ29wcG9ydHVuaXR5X2lkJywKICAgICdjbHViX25lZWRfaWQnLAogICAgJ25lZWRfcG9zaXRpb24nLAogIF0gYXMgY29uc3Q7CgogIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHsKICAgIGNvbnN0IHZhbHVlID0gcGFyYW1zLmdldChrZXkpOwogICAgaWYgKCF2YWx1ZSB8fCAoaWRLZXlzLmhhcyhrZXkpICYmICFESk1fVVVJRF9QQVRURVJOLnRlc3QodmFsdWUpKSkgY29udGludWU7CiAgICAoY29udGV4dCBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KVtrZXldID0gdmFsdWU7CiAgfQoKICByZXR1cm4gY29udGV4dDsKfQoKZXhwb3J0IGZ1bmN0aW9uIHRlbGxEam1IcmVmKAogIHBhdGhuYW1lOiBzdHJpbmcsCiAgY29udGV4dDogRGptRW50aXR5Q29udGV4dCwKKTogc3RyaW5nIHsKICBjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHsgZnJvbTogcGF0aG5hbWUgfSk7CiAgY29uc3QgdmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkPiA9IHsKICAgIGNvbnRleHRfdHlwZTogY29udGV4dC5jb250ZXh0X3R5cGUsCiAgICBsYWJlbDogY29udGV4dC5sYWJlbCwKICAgIG9yZ2FuaXNhdGlvbl9pZDogY29udGV4dC5vcmdhbmlzYXRpb25faWQsCiAgICBvcmdhbmlzYXRpb25fbmFtZTogY29udGV4dC5vcmdhbmlzYXRpb25fbmFtZSwKICAgIHBlcnNvbl9pZDogY29udGV4dC5wZXJzb25faWQsCiAgICBwZXJzb25fbmFtZTogY29udGV4dC5wZXJzb25fbmFtZSwKICAgIHBsYXllcl9pZDogY29udGV4dC5wbGF5ZXJfaWQsCiAgICBwbGF5ZXJfbmFtZTogY29udGV4dC5wbGF5ZXJfbmFtZSwKICAgIHByb3NwZWN0X2lkOiBjb250ZXh0LnByb3NwZWN0X2lkLAogICAgcHJvc3BlY3RfbmFtZTogY29udGV4dC5wcm9zcGVjdF9uYW1lLAogICAgb3Bwb3J0dW5pdHlfaWQ6IGNvbnRleHQub3Bwb3J0dW5pdHlfaWQsCiAgICBjbHViX25lZWRfaWQ6IGNvbnRleHQuY2x1Yl9uZWVkX2lkLAogICAgbmVlZF9wb3NpdGlvbjogY29udGV4dC5uZWVkX3Bvc2l0aW9uLAogIH07CgogIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHZhbHVlcykpIHsKICAgIGlmICh2YWx1ZSkgcGFyYW1zLnNldChrZXksIHZhbHVlKTsKICB9CgogIHJldHVybiBgL3RlbGw/JHtwYXJhbXMudG9TdHJpbmcoKX1gOwp9Cg==",
  "lib/djm-performance.ts": "ZXhwb3J0IHR5cGUgRGptT3BlcmF0aW9uS2luZCA9ICdycGMnIHwgJ2VkZ2UnOwoKZXhwb3J0IHR5cGUgRGptUGVyZm9ybWFuY2VEZXRhaWwgPSB7CiAga2luZDogRGptT3BlcmF0aW9uS2luZDsKICBuYW1lOiBzdHJpbmc7CiAgZHVyYXRpb25fbXM6IG51bWJlcjsKICBvazogYm9vbGVhbjsKICBhdDogc3RyaW5nOwp9OwoKY29uc3Qgbm93ID0gKCkgPT4KICB0eXBlb2YgcGVyZm9ybWFuY2UgIT09ICd1bmRlZmluZWQnID8gcGVyZm9ybWFuY2Uubm93KCkgOiBEYXRlLm5vdygpOwoKZnVuY3Rpb24gcHVibGlzaChkZXRhaWw6IERqbVBlcmZvcm1hbmNlRGV0YWlsKSB7CiAgaWYgKHR5cGVvZiB3aW5kb3cgPT09ICd1bmRlZmluZWQnKSByZXR1cm47CgogIHdpbmRvdy5kaXNwYXRjaEV2ZW50KAogICAgbmV3IEN1c3RvbUV2ZW50PERqbVBlcmZvcm1hbmNlRGV0YWlsPignZGptOnBlcmZvcm1hbmNlJywgeyBkZXRhaWwgfSksCiAgKTsKCn0KCmV4cG9ydCBhc3luYyBmdW5jdGlvbiBtZWFzdXJlRGptT3BlcmF0aW9uPFQ+KAogIGtpbmQ6IERqbU9wZXJhdGlvbktpbmQsCiAgbmFtZTogc3RyaW5nLAogIG9wZXJhdGlvbjogKCkgPT4gUHJvbWlzZTxUPiwKKTogUHJvbWlzZTxUPiB7CiAgY29uc3Qgc3RhcnRlZEF0ID0gbm93KCk7CgogIHRyeSB7CiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBvcGVyYXRpb24oKTsKICAgIHB1Ymxpc2goewogICAgICBraW5kLAogICAgICBuYW1lLAogICAgICBkdXJhdGlvbl9tczogTWF0aC5tYXgoMCwgTWF0aC5yb3VuZChub3coKSAtIHN0YXJ0ZWRBdCkpLAogICAgICBvazogdHJ1ZSwKICAgICAgYXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSwKICAgIH0pOwogICAgcmV0dXJuIHJlc3VsdDsKICB9IGNhdGNoIChlcnJvcikgewogICAgcHVibGlzaCh7CiAgICAgIGtpbmQsCiAgICAgIG5hbWUsCiAgICAgIGR1cmF0aW9uX21zOiBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKG5vdygpIC0gc3RhcnRlZEF0KSksCiAgICAgIG9rOiBmYWxzZSwKICAgICAgYXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSwKICAgIH0pOwogICAgdGhyb3cgZXJyb3I7CiAgfQp9Cg==",
  "supabase/functions/_shared/djm-ai-router.ts": "Ly8gQHRzLW5vY2hlY2sKZXhwb3J0IHR5cGUgRGptQWlUYXNrID0KICB8ICd0ZWxsX2RqbScKICB8ICdob21lX3ByaW9yaXR5JwogIHwgJ21lZXRpbmdfYnJpZWYnCiAgfCAncGxheWVyX2ludGVsbGlnZW5jZScKICB8ICdyZWNydWl0bWVudF9pbnRlbGxpZ2VuY2UnCiAgfCAnZGVhbF9pbnRlbGxpZ2VuY2UnCiAgfCAnY29udHJhY3RfcmVhc29uaW5nJwogIHwgJ2RhdGFfY2xlYW51cCc7CgpleHBvcnQgdHlwZSBEam1BaVRpZXIgPSAnZmFzdCcgfCAnYmFsYW5jZWQnIHwgJ2RlZXAnOwoKZXhwb3J0IHR5cGUgRGptQWlSb3V0ZSA9IHsKICB0aWVyOiBEam1BaVRpZXI7CiAgbW9kZWw6IHN0cmluZzsKICByZWFzb25pbmdfZWZmb3J0OiAnbm9uZScgfCAnbG93JyB8ICdtZWRpdW0nOwogIGlucHV0X3VzZF9wZXJfbWlsbGlvbjogbnVtYmVyOwogIG91dHB1dF91c2RfcGVyX21pbGxpb246IG51bWJlcjsKICByZWFzb246IHN0cmluZzsKfTsKCnR5cGUgUm91dGVJbnB1dCA9IHsKICB0ZXh0Pzogc3RyaW5nIHwgbnVsbDsKICBmb3JjZVRpZXI/OiBEam1BaVRpZXIgfCBudWxsOwp9OwoKY29uc3QgZW52TnVtYmVyID0gKG5hbWU6IHN0cmluZywgZmFsbGJhY2s6IG51bWJlcikgPT4gewogIGNvbnN0IHZhbHVlID0gTnVtYmVyKERlbm8uZW52LmdldChuYW1lKSk7CiAgcmV0dXJuIE51bWJlci5pc0Zpbml0ZSh2YWx1ZSkgJiYgdmFsdWUgPj0gMCA/IHZhbHVlIDogZmFsbGJhY2s7Cn07Cgpjb25zdCBST1VURVM6IFJlY29yZDxEam1BaVRpZXIsIERqbUFpUm91dGU+ID0gewogIGZhc3Q6IHsKICAgIHRpZXI6ICdmYXN0JywKICAgIG1vZGVsOiBEZW5vLmVudi5nZXQoJ0RKTV9BSV9GQVNUX01PREVMJykgfHwgJ2dwdC01LjYtbHVuYScsCiAgICByZWFzb25pbmdfZWZmb3J0OiAnbm9uZScsCiAgICBpbnB1dF91c2RfcGVyX21pbGxpb246IGVudk51bWJlcignREpNX0FJX0ZBU1RfSU5QVVRfVVNEX1BFUl9NSUxMSU9OJywgMC4yKSwKICAgIG91dHB1dF91c2RfcGVyX21pbGxpb246IGVudk51bWJlcignREpNX0FJX0ZBU1RfT1VUUFVUX1VTRF9QRVJfTUlMTElPTicsIDEuMiksCiAgICByZWFzb246ICdyb3V0aW5lIHN0cnVjdHVyZWQgYWdlbmN5IHdvcmsnLAogIH0sCiAgYmFsYW5jZWQ6IHsKICAgIHRpZXI6ICdiYWxhbmNlZCcsCiAgICBtb2RlbDogRGVuby5lbnYuZ2V0KCdESk1fQUlfQkFMQU5DRURfTU9ERUwnKSB8fCAnZ3B0LTUuNi10ZXJyYScsCiAgICByZWFzb25pbmdfZWZmb3J0OiAnbm9uZScsCiAgICBpbnB1dF91c2RfcGVyX21pbGxpb246IGVudk51bWJlcignREpNX0FJX0JBTEFOQ0VEX0lOUFVUX1VTRF9QRVJfTUlMTElPTicsIDIpLAogICAgb3V0cHV0X3VzZF9wZXJfbWlsbGlvbjogZW52TnVtYmVyKCdESk1fQUlfQkFMQU5DRURfT1VUUFVUX1VTRF9QRVJfTUlMTElPTicsIDEyKSwKICAgIHJlYXNvbjogJ2FtYmlndW91cyBvciBoaWdoZXItcmlzayBhZ2VuY3kgd29yaycsCiAgfSwKICBkZWVwOiB7CiAgICB0aWVyOiAnZGVlcCcsCiAgICBtb2RlbDogRGVuby5lbnYuZ2V0KCdESk1fQUlfREVFUF9NT0RFTCcpIHx8ICdncHQtNS42LXNvbCcsCiAgICByZWFzb25pbmdfZWZmb3J0OiAnbG93JywKICAgIGlucHV0X3VzZF9wZXJfbWlsbGlvbjogZW52TnVtYmVyKCdESk1fQUlfREVFUF9JTlBVVF9VU0RfUEVSX01JTExJT04nLCA0KSwKICAgIG91dHB1dF91c2RfcGVyX21pbGxpb246IGVudk51bWJlcignREpNX0FJX0RFRVBfT1VUUFVUX1VTRF9QRVJfTUlMTElPTicsIDIwKSwKICAgIHJlYXNvbjogJ2NvbXBsZXggcHJvZmVzc2lvbmFsIHJlYXNvbmluZycsCiAgfSwKfTsKCmNvbnN0IEhJR0hfUklTSyA9IFsKICAvXGJjb250cmFjdCg/OnVhbCk/XGIvaSwKICAvXGJyZXByZXNlbnRhdGlvbiBhZ3JlZW1lbnRcYi9pLAogIC9cYnRlcm1pbmF0aW9uXGIvaSwKICAvXGJyZWxlYXNlIGNsYXVzZVxiL2ksCiAgL1xic2VsbFstIF1vblxiL2ksCiAgL1xiY29tbWlzc2lvblxiL2ksCiAgL1xiaW1hZ2UgcmlnaHRzP1xiL2ksCiAgL1xid29yayBwZXJtaXRcYi9pLAogIC9cYnJlZ2lzdHJhdGlvbiBydWxlL2ksCiAgL1xibGVnYWxcYi9pLApdOwoKY29uc3QgTUVESVVNX1JJU0sgPSBbCiAgL1xic2FsYXJ5XGIvaSwKICAvXGJ3YWdlXGIvaSwKICAvXGJ0cmFuc2ZlciBmZWVcYi9pLAogIC9cYmxvYW4gZmVlXGIvaSwKICAvXGJib251c1xiL2ksCiAgL1xiZ3Jvc3NcYi9pLAogIC9cYm5ldFxiL2ksCiAgL1xidGF4XGIvaSwKICAvXGJvcHRpb25cYi9pLApdOwoKZnVuY3Rpb24gY29tcGxleGl0eVNjb3JlKHRhc2s6IERqbUFpVGFzaywgdGV4dDogc3RyaW5nKSB7CiAgbGV0IHNjb3JlID0gMDsKCiAgaWYgKHRleHQubGVuZ3RoID4gMTYwMCkgc2NvcmUgKz0gMTsKICBpZiAodGV4dC5sZW5ndGggPiA0MDAwKSBzY29yZSArPSAyOwogIGlmIChISUdIX1JJU0suc29tZSgocGF0dGVybikgPT4gcGF0dGVybi50ZXN0KHRleHQpKSkgc2NvcmUgKz0gMjsKICBpZiAoTUVESVVNX1JJU0suZmlsdGVyKChwYXR0ZXJuKSA9PiBwYXR0ZXJuLnRlc3QodGV4dCkpLmxlbmd0aCA+PSAyKSBzY29yZSArPSAxOwoKICBpZiAodGFzayA9PT0gJ2NvbnRyYWN0X3JlYXNvbmluZycpIHNjb3JlICs9IDM7CiAgaWYgKHRhc2sgPT09ICdwbGF5ZXJfaW50ZWxsaWdlbmNlJyB8fCB0YXNrID09PSAnZGVhbF9pbnRlbGxpZ2VuY2UnKSBzY29yZSArPSAxOwogIGlmICh0YXNrID09PSAnZGF0YV9jbGVhbnVwJykgc2NvcmUgPSBNYXRoLm1pbihzY29yZSwgMSk7CgogIHJldHVybiBzY29yZTsKfQoKZXhwb3J0IGZ1bmN0aW9uIHNlbGVjdERqbUFpUm91dGUoCiAgdGFzazogRGptQWlUYXNrLAogIGlucHV0OiBSb3V0ZUlucHV0ID0ge30sCik6IERqbUFpUm91dGUgewogIGlmIChpbnB1dC5mb3JjZVRpZXIpIHJldHVybiBST1VURVNbaW5wdXQuZm9yY2VUaWVyXTsKCiAgY29uc3QgdGV4dCA9IFN0cmluZyhpbnB1dC50ZXh0IHx8ICcnKS50cmltKCk7CiAgY29uc3Qgc2NvcmUgPSBjb21wbGV4aXR5U2NvcmUodGFzaywgdGV4dCk7CgogIGlmIChzY29yZSA+PSAzKSByZXR1cm4gUk9VVEVTLmRlZXA7CiAgaWYgKHNjb3JlID49IDEpIHJldHVybiBST1VURVMuYmFsYW5jZWQ7CiAgcmV0dXJuIFJPVVRFUy5mYXN0Owp9CgpleHBvcnQgZnVuY3Rpb24gZXN0aW1hdGVEam1BaUNvc3QoCiAgcm91dGU6IERqbUFpUm91dGUsCiAgaW5wdXRUb2tlbnM6IG51bWJlciwKICBvdXRwdXRUb2tlbnM6IG51bWJlciwKKSB7CiAgcmV0dXJuICgKICAgIChNYXRoLm1heCgwLCBpbnB1dFRva2VucykgLyAxXzAwMF8wMDApICogcm91dGUuaW5wdXRfdXNkX3Blcl9taWxsaW9uICsKICAgIChNYXRoLm1heCgwLCBvdXRwdXRUb2tlbnMpIC8gMV8wMDBfMDAwKSAqIHJvdXRlLm91dHB1dF91c2RfcGVyX21pbGxpb24KICApOwp9Cg==",
  "app/djm-os-v3.css": "LyogREpNIE9TIHYzIHZpc3VhbCBmb3VuZGF0aW9uLgogICBTdGFmZiBvcGVyYXRpbmcgc3lzdGVtIG9ubHkuIFBsYXllci1mYWNpbmcgbGF5b3V0cyByZW1haW4gdW50b3VjaGVkLiAqLwoKLmRqbS1vcy1yb290IHsKICAtLWRqbS12My1iZzogI2YzZjZmOTsKICAtLWRqbS12My1zdXJmYWNlOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuOTQpOwogIC0tZGptLXYzLXN1cmZhY2Utc29saWQ6ICNmZmZmZmY7CiAgLS1kam0tdjMtYm9yZGVyOiByZ2JhKDE1LCA0MywgNjcsIDAuMTApOwogIC0tZGptLXYzLWJvcmRlci1zdHJvbmc6IHJnYmEoMTUsIDQzLCA2NywgMC4xNyk7CiAgLS1kam0tdjMtc2hhZG93OiAwIDE4cHggNTBweCByZ2JhKDYsIDMxLCA1OCwgMC4wNyk7CiAgLS1kam0tdjMtc2hhZG93LWhvdmVyOiAwIDIycHggNThweCByZ2JhKDYsIDMxLCA1OCwgMC4xMSk7CiAgLS1kam0tdjMtcmFkaXVzOiAyMHB4OwogIC0tZGptLXYzLXJhZGl1cy1zbWFsbDogMTNweDsKICAtLWRqbS12My1tb3Rpb246IDE2MG1zIGN1YmljLWJlemllcigwLjIsIDAuOCwgMC4yLCAxKTsKCiAgYmFja2dyb3VuZDoKICAgIHJhZGlhbC1ncmFkaWVudChjaXJjbGUgYXQgODUlIC0xMCUsIHJnYmEoMjQ1LCAyMzMsIDAsIDAuMTApLCB0cmFuc3BhcmVudCAzNHJlbSksCiAgICBsaW5lYXItZ3JhZGllbnQoMTgwZGVnLCAjZjhmYWZjIDAlLCB2YXIoLS1kam0tdjMtYmcpIDU0JSwgI2VlZjNmNyAxMDAlKTsKICBjb2xvcjogIzEwMjIzNTsKICBmb250LWZlYXR1cmUtc2V0dGluZ3M6ICdzczAxJyAxLCAnY3YwMicgMSwgJ2N2MDMnIDE7CiAgLXdlYmtpdC1mb250LXNtb290aGluZzogYW50aWFsaWFzZWQ7Cn0KCi5kam0tb3Mtcm9vdCAqLAouZGptLW9zLXJvb3QgKjo6YmVmb3JlLAouZGptLW9zLXJvb3QgKjo6YWZ0ZXIgewogIGJveC1zaXppbmc6IGJvcmRlci1ib3g7Cn0KCi5kam0tb3MtaGVhZGVyIHsKICBtaW4taGVpZ2h0OiA2NnB4OwogIGJvcmRlci1ib3R0b206IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDkpOwogIGJhY2tncm91bmQ6IHJnYmEoNSwgMjUsIDQ2LCAwLjk0KTsKICBib3gtc2hhZG93OiAwIDEwcHggMzRweCByZ2JhKDQsIDE5LCAzNSwgMC4xMik7CiAgYmFja2Ryb3AtZmlsdGVyOiBibHVyKDI0cHgpIHNhdHVyYXRlKDEuMjUpOwp9CgouZGptLW9zLWhlYWRlci1pbm5lciB7CiAgd2lkdGg6IG1pbigxNTIwcHgsIGNhbGMoMTAwJSAtIDM4cHgpKTsKICBtaW4taGVpZ2h0OiA2NnB4OwogIGdhcDogMjBweDsKfQoKLmRqbS1vcy1jaGlwIHsKICBib3JkZXItY29sb3I6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xMyk7CiAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA0NSk7CiAgY29sb3I6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC43Mik7CiAgbGV0dGVyLXNwYWNpbmc6IDAuMDhlbTsKfQoKLmRqbS1vcy1tYWluIHsKICB3aWR0aDogbWluKDE1MjBweCwgY2FsYygxMDAlIC0gMzhweCkpOwogIHBhZGRpbmc6IDMwcHggMCA4NHB4Owp9CgouZGptLW9zLXBhZ2UtaGVhZCB7CiAgbWFyZ2luLWJvdHRvbTogMjRweDsKICBhbGlnbi1pdGVtczogY2VudGVyOwp9CgouZGptLW9zLXBhZ2UtaGVhZCBoMSB7CiAgbWFyZ2luLXRvcDogNXB4OwogIGZvbnQtc2l6ZTogY2xhbXAoMzBweCwgMy4xdncsIDQzcHgpOwogIGxpbmUtaGVpZ2h0OiAwLjk4OwogIGxldHRlci1zcGFjaW5nOiAtMC4wNDVlbTsKfQoKLmRqbS1vcy1leWVicm93IHsKICBjb2xvcjogIzcxODM5MzsKICBmb250LXNpemU6IDEwcHg7CiAgbGV0dGVyLXNwYWNpbmc6IDAuMTVlbTsKfQoKLmRqbS1vcy11c2VyIHsKICBwYWRkaW5nOiA4cHggMTFweDsKICBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1kam0tdjMtYm9yZGVyKTsKICBib3JkZXItcmFkaXVzOiAxMnB4OwogIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC42Mik7Cn0KCi5kam0tb3MtdXNlciBzcGFuIHsKICBmb250LXNpemU6IDEycHg7Cn0KCi5kam0tb3MtdXNlciBzbWFsbCB7CiAgZm9udC1zaXplOiA5cHg7Cn0KCi5kam0tb3MtcGFuZWwsCi5kam0tb3MtbWV0cmljLAouZGptLW9zLXBlcnNvbi1jYXJkLAouZGptLW9zLWNsdWItY2FyZCB7CiAgYm9yZGVyLWNvbG9yOiB2YXIoLS1kam0tdjMtYm9yZGVyKTsKICBiYWNrZ3JvdW5kOiB2YXIoLS1kam0tdjMtc3VyZmFjZSk7CiAgYm94LXNoYWRvdzogdmFyKC0tZGptLXYzLXNoYWRvdyk7CiAgYmFja2Ryb3AtZmlsdGVyOiBibHVyKDE2cHgpOwp9CgouZGptLW9zLXBhbmVsIHsKICBib3JkZXItcmFkaXVzOiB2YXIoLS1kam0tdjMtcmFkaXVzKTsKfQoKLmRqbS1vcy1tZXRyaWMgewogIGJvcmRlci1yYWRpdXM6IDE3cHg7Cn0KCi5kam0tb3MtcGVyc29uLWNhcmQsCi5kam0tb3MtY2x1Yi1jYXJkIHsKICBib3JkZXItcmFkaXVzOiAxNnB4Owp9CgouZGptLW9zLXBhbmVsLAouZGptLW9zLW1ldHJpYywKLmRqbS1vcy1wZXJzb24tY2FyZCwKLmRqbS1vcy1jbHViLWNhcmQsCi5kam0tb3Mtc2VhcmNoLXJlc3VsdCB7CiAgdHJhbnNpdGlvbjoKICAgIHRyYW5zZm9ybSB2YXIoLS1kam0tdjMtbW90aW9uKSwKICAgIGJveC1zaGFkb3cgdmFyKC0tZGptLXYzLW1vdGlvbiksCiAgICBib3JkZXItY29sb3IgdmFyKC0tZGptLXYzLW1vdGlvbiksCiAgICBiYWNrZ3JvdW5kIHZhcigtLWRqbS12My1tb3Rpb24pOwp9CgpAbWVkaWEgKGhvdmVyOiBob3ZlcikgewogIC5kam0tb3MtcGVyc29uLWNhcmQ6aG92ZXIsCiAgLmRqbS1vcy1jbHViLWNhcmQ6aG92ZXIgewogICAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0ycHgpOwogICAgYm9yZGVyLWNvbG9yOiB2YXIoLS1kam0tdjMtYm9yZGVyLXN0cm9uZyk7CiAgICBib3gtc2hhZG93OiB2YXIoLS1kam0tdjMtc2hhZG93LWhvdmVyKTsKICB9Cn0KCi5kam0tb3MtcGFuZWwtaGVhZCB7CiAgcGFkZGluZzogMTlweCAyMXB4IDE1cHg7CiAgYm9yZGVyLWJvdHRvbS1jb2xvcjogcmdiYSgxNSwgNDMsIDY3LCAwLjA3NSk7Cn0KCi5kam0tb3MtcGFuZWwtaGVhZCBoMiB7CiAgZm9udC1zaXplOiAxNnB4OwogIGxldHRlci1zcGFjaW5nOiAtMC4wMjVlbTsKfQoKLmRqbS1vcy1wcmltYXJ5LWJ1dHRvbiwKLmRqbS1vcy1zZWNvbmRhcnktYnV0dG9uLAouZGptLW9zLW1pbmktYnV0dG9uLAouZGptLW9zLWljb24tYnV0dG9uLAouZGptLW9zLXNlYXJjaC10cmlnZ2VyLAouZGptLW9zLWNhcHR1cmUtdHJpZ2dlciB7CiAgdHJhbnNpdGlvbjoKICAgIHRyYW5zZm9ybSB2YXIoLS1kam0tdjMtbW90aW9uKSwKICAgIGJhY2tncm91bmQgdmFyKC0tZGptLXYzLW1vdGlvbiksCiAgICBib3JkZXItY29sb3IgdmFyKC0tZGptLXYzLW1vdGlvbiksCiAgICBib3gtc2hhZG93IHZhcigtLWRqbS12My1tb3Rpb24pLAogICAgY29sb3IgdmFyKC0tZGptLXYzLW1vdGlvbik7Cn0KCi5kam0tb3MtcHJpbWFyeS1idXR0b24sCi5kam0tb3Mtc2Vjb25kYXJ5LWJ1dHRvbiB7CiAgbWluLWhlaWdodDogMzlweDsKICBib3JkZXItcmFkaXVzOiAxMXB4Owp9CgouZGptLW9zLXByaW1hcnktYnV0dG9uIHsKICBib3gtc2hhZG93OiAwIDhweCAyMHB4IHJnYmEoNiwgMzEsIDU4LCAwLjEzKTsKfQoKLmRqbS1vcy1zZWNvbmRhcnktYnV0dG9uIHsKICBib3JkZXItY29sb3I6IHZhcigtLWRqbS12My1ib3JkZXIpOwogIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC44Mik7Cn0KCi5kam0tb3MtaWNvbi1idXR0b24gewogIHdpZHRoOiAzNnB4OwogIGhlaWdodDogMzZweDsKICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDgpOwogIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNjUpOwp9CgouZGptLW9zLWljb24tYnV0dG9uOmhvdmVyIHsKICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTFweCk7CiAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEyKTsKfQoKLmRqbS1vcy1zZWFyY2gtdHJpZ2dlciwKLmRqbS1vcy1jYXB0dXJlLXRyaWdnZXIgewogIGJvcmRlci1jb2xvcjogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEwKSAhaW1wb3J0YW50OwogIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNjUpICFpbXBvcnRhbnQ7CiAgYm94LXNoYWRvdzogbm9uZSAhaW1wb3J0YW50Owp9CgouZGptLW9zLXNlYXJjaC10cmlnZ2VyOmhvdmVyLAouZGptLW9zLWNhcHR1cmUtdHJpZ2dlcjpob3ZlciB7CiAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEyKSAhaW1wb3J0YW50OwogIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtMXB4KTsKfQoKLmRqbS1vcy1zZWFyY2gtb3ZlcmxheSB7CiAgYmFja2dyb3VuZDogcmdiYSgzLCAxNCwgMjYsIDAuNTIpOwogIGJhY2tkcm9wLWZpbHRlcjogYmx1cigxMHB4KTsKfQoKLmRqbS1vcy1zZWFyY2gtbW9kYWwsCi5kam0tb3MtY2FwdHVyZS1tb2RhbCB7CiAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjQ1KTsKICBib3JkZXItcmFkaXVzOiAyMnB4OwogIGJhY2tncm91bmQ6IHJnYmEoMjUyLCAyNTMsIDI1NCwgMC45NzUpOwogIGJveC1zaGFkb3c6IDAgMzJweCA5MHB4IHJnYmEoMiwgMTgsIDMyLCAwLjI4KTsKfQoKLmRqbS1vcy1zZWFyY2gtbW9kYWwtaGVhZCB7CiAgbWluLWhlaWdodDogNjRweDsKICBib3JkZXItYm90dG9tLWNvbG9yOiB2YXIoLS1kam0tdjMtYm9yZGVyKTsKfQoKLmRqbS1vcy1zZWFyY2gtcmVzdWx0IHsKICBib3JkZXItcmFkaXVzOiAxM3B4Owp9CgouZGptLW9zLXNlYXJjaC1yZXN1bHQ6aG92ZXIgewogIGJvcmRlci1jb2xvcjogcmdiYSg2LCAzMSwgNTgsIDAuMTMpOwogIGJhY2tncm91bmQ6ICNmN2Y5ZmI7Cn0KCi5kam0tb3Mtcm9vdCA6d2hlcmUoYnV0dG9uLCBhLCBpbnB1dCwgc2VsZWN0LCB0ZXh0YXJlYSk6Zm9jdXMtdmlzaWJsZSB7CiAgb3V0bGluZTogM3B4IHNvbGlkIHJnYmEoMjQ1LCAyMzMsIDAsIDAuNTYpOwogIG91dGxpbmUtb2Zmc2V0OiAycHg7Cn0KCi5kam0taG9tZS12Mi1oZXJvIHsKICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMTApICFpbXBvcnRhbnQ7CiAgYm9yZGVyLXJhZGl1czogMjRweCAhaW1wb3J0YW50OwogIGJhY2tncm91bmQ6CiAgICByYWRpYWwtZ3JhZGllbnQoY2lyY2xlIGF0IDg1JSAwJSwgcmdiYSgyNDUsIDIzMywgMCwgMC4xNCksIHRyYW5zcGFyZW50IDIzcmVtKSwKICAgIGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICMwNjFmM2EgMCUsICMwOTJiNGMgMTAwJSkgIWltcG9ydGFudDsKICBib3gtc2hhZG93OiAwIDI4cHggNjVweCByZ2JhKDYsIDMxLCA1OCwgMC4xNikgIWltcG9ydGFudDsKfQoKLmRqbS1ob21lLXYyLXRhc2sgewogIGJvcmRlci1jb2xvcjogdmFyKC0tZGptLXYzLWJvcmRlcikgIWltcG9ydGFudDsKICBib3JkZXItcmFkaXVzOiAxNnB4ICFpbXBvcnRhbnQ7CiAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjkyKSAhaW1wb3J0YW50OwogIGJveC1zaGFkb3c6IDAgOHB4IDI4cHggcmdiYSg2LCAzMSwgNTgsIDAuMDQ1KSAhaW1wb3J0YW50Owp9CgouZGptLWhvbWUtdjItdGFzazpob3ZlciB7CiAgYm9yZGVyLWNvbG9yOiB2YXIoLS1kam0tdjMtYm9yZGVyLXN0cm9uZykgIWltcG9ydGFudDsKICBib3gtc2hhZG93OiAwIDE0cHggMzZweCByZ2JhKDYsIDMxLCA1OCwgMC4wNzUpICFpbXBvcnRhbnQ7Cn0KCkBtZWRpYSAobWF4LXdpZHRoOiA5MDBweCkgewogIC5kam0tb3MtaGVhZGVyLWlubmVyLAogIC5kam0tb3MtbWFpbiB7CiAgICB3aWR0aDogbWluKDEwMCUgLSAyNHB4LCAxNTIwcHgpOwogIH0KCiAgLmRqbS1vcy1tYWluIHsKICAgIHBhZGRpbmctdG9wOiAyMnB4OwogIH0KCiAgLmRqbS1vcy1wYWdlLWhlYWQgewogICAgYWxpZ24taXRlbXM6IGZsZXgtc3RhcnQ7CiAgfQoKICAuZGptLW9zLXVzZXIgewogICAgZGlzcGxheTogbm9uZTsKICB9Cn0KCkBtZWRpYSAocHJlZmVycy1yZWR1Y2VkLW1vdGlvbjogcmVkdWNlKSB7CiAgLmRqbS1vcy1yb290ICosCiAgLmRqbS1vcy1yb290ICo6OmJlZm9yZSwKICAuZGptLW9zLXJvb3QgKjo6YWZ0ZXIgewogICAgc2Nyb2xsLWJlaGF2aW9yOiBhdXRvICFpbXBvcnRhbnQ7CiAgICB0cmFuc2l0aW9uLWR1cmF0aW9uOiAwLjAwMW1zICFpbXBvcnRhbnQ7CiAgICBhbmltYXRpb24tZHVyYXRpb246IDAuMDAxbXMgIWltcG9ydGFudDsKICAgIGFuaW1hdGlvbi1pdGVyYXRpb24tY291bnQ6IDEgIWltcG9ydGFudDsKICB9Cn0K",
  "docs/DJM_INTELLIGENCE_OS.md": "IyBESk0gSW50ZWxsaWdlbmNlIE9TCgojIyBOb3J0aCBzdGFyCgpESk0gc2hvdWxkIGZlZWwgbGlrZSBvbmUgaW50ZWxsaWdlbnQgZm9vdGJhbGwgYWdlbmN5IG9wZXJhdGluZyBzeXN0ZW0sIG5vdCBhIHNldCBvZiBwYWdlcyB3aXRoIEFJIGZlYXR1cmVzIGF0dGFjaGVkLgoKRXZlcnkgbWVhbmluZ2Z1bCBvYmplY3QgaW4gdGhlIHBsYXRmb3JtIHNob3VsZCBiZSBjb25uZWN0ZWQ6IHBsYXllcnMsIHJlY3J1aXRtZW50IHRhcmdldHMsIGNsdWJzLCBjb250YWN0cywgcmVsYXRpb25zaGlwcywgbmVlZHMsIG9wcG9ydHVuaXRpZXMsIGRlYWxzLCBtZWV0aW5ncywgdGFza3MsIG1lc3NhZ2VzLCBldmlkZW5jZSwgZG9jdW1lbnRzLCBzdGF0cyBhbmQgZGVjaXNpb25zLiBBSSBzaG91bGQgdXNlIHRoYXQgc2hhcmVkIGNvbnRleHQsIHBlcmZvcm0gc2FmZSByZXBldGl0aXZlIHdvcmsgYXV0b21hdGljYWxseSBhbmQgYnJpbmcgaHVtYW5zIGluIG9ubHkgd2hlbiBqdWRnbWVudCwgYXBwcm92YWwgb3IgdW5jZXJ0YWludHkgZ2VudWluZWx5IG1hdHRlcnMuCgpUaGUgcHJvZHVjdCBxdWFsaXR5IGJhciBpcyBwcmVtaXVtIEIyQiBzb2Z0d2FyZTogaW5zdGFudC1mZWVsaW5nIG5hdmlnYXRpb24sIGNhbG0gdmlzdWFsIGhpZXJhcmNoeSwgY29uc2lzdGVudCBpbnRlcmFjdGlvbiBwYXR0ZXJucywgdmlzaWJsZSBwcm92ZW5hbmNlLCByZXZlcnNpYmxlIGF1dG9tYXRpb24gYW5kIG5vIGR1cGxpY2F0ZWQgY29udGV4dCBsb2dpYy4KCiMjIFByb2R1Y3QgcHJpbmNpcGxlcwoKMS4gT25lIGNvbnRleHQgZ3JhcGgKICAgLSBFdmVyeSBzY3JlZW4gcmVzb2x2ZXMgdG8gdGhlIHNhbWUgY2Fub25pY2FsIGVudGl0eSBjb250ZXh0LgogICAtIFRlbGwgREpNLCBzZWFyY2gsIEhvbWUsIHBsYXllciBpbnRlbGxpZ2VuY2UgYW5kIGZ1dHVyZSBhc3Npc3RhbnRzIGNvbnN1bWUgdGhlIHNhbWUgY29udGV4dCBlbnZlbG9wZS4KICAgLSBObyBwYWdlLXNwZWNpZmljIGNvcGllcyBvZiBpZGVudGl0eSBvciByZWxhdGlvbnNoaXAgbG9naWMuCgoyLiBPbmUgQUkgcm91dGVyCiAgIC0gRmFzdCByb3V0aW5lIHdvcmsgdXNlcyBHUFQtNS42IEx1bmEuCiAgIC0gSGlnaGVyLXJpc2sgb3IgbW9yZSBhbWJpZ3VvdXMgd29yayByb3V0ZXMgdG8gR1BULTUuNiBUZXJyYS4KICAgLSBEZWVwIHByb2Zlc3Npb25hbCByZWFzb25pbmcgY2FuIHJvdXRlIHRvIEdQVC01LjYgU29sLgogICAtIFJvdXRpbmcgaXMgYmFzZWQgb24gdGFzaywgY29tcGxleGl0eSBhbmQgcmlzaywgbm90IGEgc2luZ2xlIG1vZGVsIGNvbmZpZ3VyZWQgZm9yIGV2ZXJ5IHJlcXVlc3QuCgozLiBPbmUgYXV0b21hdGlvbiBwb2xpY3kKICAgLSBMb3ctcmlzaywgcmV2ZXJzaWJsZSBhbmQgaGlnaC1jb25maWRlbmNlIHdvcmsgbWF5IGV4ZWN1dGUgYXV0b21hdGljYWxseS4KICAgLSBNZWRpdW0tcmlzayB3b3JrIGlzIHByZXBhcmVkIGFuZCBzdWdnZXN0ZWQuCiAgIC0gRmluYW5jaWFsLCBjb250cmFjdHVhbCwgZGVzdHJ1Y3RpdmUsIGV4dGVybmFsbHkgdmlzaWJsZSBvciB1bmNlcnRhaW4gd29yayByZXF1aXJlcyByZXZpZXcuCiAgIC0gRXZlcnkgYXV0b21hdGVkIGFjdGlvbiBtdXN0IGJlIGF0dHJpYnV0YWJsZSwgaW5zcGVjdGFibGUgYW5kIHVuZG9hYmxlIHdoZXJlIHBvc3NpYmxlLgoKNC4gT25lIHByaW9yaXR5IHN5c3RlbQogICAtIEhvbWUgaXMgbm90IGEgZGFzaGJvYXJkIG9mIG1vZHVsZXMuCiAgIC0gSG9tZSBpcyB0aGUgcmFua2VkIGFnZW5jeSB3b3JrIHF1ZXVlLgogICAtIFRhc2tzLCByZWxhdGlvbnNoaXAgc2lnbmFscywgY2x1YiBuZWVkcywgcGxheWVyIGlzc3VlcywgcmVjcnVpdG1lbnQgZm9sbG93LXVwcyBhbmQgZGVhbCBibG9ja2VycyBjb21wZXRlIGluIG9uZSBwcmlvcml0eSBtb2RlbC4KCjUuIE9uZSBkZXNpZ24gc3lzdGVtCiAgIC0gREpNIG5hdnkgYW5kIHllbGxvdyByZW1haW4gdGhlIGJyYW5kIGFuY2hvcnMuCiAgIC0gWWVsbG93IGlzIGEgcHJlY2lzaW9uIGFjY2VudCwgbm90IGEgcGFnZSBiYWNrZ3JvdW5kLgogICAtIFNoYXJlZCBzdXJmYWNlcywgcmFkaWksIHNoYWRvd3MsIHR5cG9ncmFwaHksIG1vdGlvbiBhbmQgY29tbWFuZCBwYXR0ZXJucyBhcmUgZGVmaW5lZCBnbG9iYWxseS4KICAgLSBOZXcgcHJvZHVjdCBhcmVhcyBzaG91bGQgbm90IGludHJvZHVjZSB0aGVpciBvd24gdmlzdWFsIGxhbmd1YWdlLgoKNi4gTWVhc3VyZSB0aGUgZXhwZXJpZW5jZQogICAtIENhcHR1cmUgdXBsb2FkLCB0cmFuc2NyaXB0aW9uLCBpbnRlcnByZXRhdGlvbiwgZW50aXR5IHJlc29sdXRpb24gYW5kIHdyaXRlcyBhcmUgdGltZWQgaW5kZXBlbmRlbnRseS4KICAgLSBIb21lIGxvYWQsIHNlYXJjaCBsYXRlbmN5IGFuZCBrZXkgcGFnZSB0cmFuc2l0aW9ucyBzaG91bGQgYmUgbWVhc3VyZWQuCiAgIC0gQUkgYWNjZXB0YW5jZSwgY29ycmVjdGlvbiwgdW5kbywgcmV0cnkgYW5kIGZhaWx1cmUgcmF0ZXMgc2hvdWxkIGJlY29tZSBwcm9kdWN0IG1ldHJpY3MuCgojIyBUZWxsIERKTSBsYXRlbmN5IGJ1ZGdldAoKVGFyZ2V0IGZvciBhIG5vcm1hbCBzaG9ydCB2b2ljZSBub3RlOgoKLSBSZWNvcmRpbmcgc3RvcCB0byBzYWZlbHkgc3RvcmVkIGFja25vd2xlZGdlbWVudDogdW5kZXIgMS41IHNlY29uZHMgYWZ0ZXIgdXBsb2FkIGNvbXBsZXRlcy4KLSBUcmFuc2NyaXB0IGF2YWlsYWJsZTogdHlwaWNhbGx5IHVuZGVyIDMgc2Vjb25kcyBhZnRlciB1cGxvYWQgb24gYSB3YXJtIHBhdGguCi0gUm91dGluZSBzdHJ1Y3R1cmVkIHJlc3VsdDogdHlwaWNhbGx5IDMgdG8gOCBzZWNvbmRzIGVuZC10by1lbmQgYWZ0ZXIgdXBsb2FkLgotIERlZXAgb3IgYW1iaWd1b3VzIHJlcXVlc3RzIG1heSB0YWtlIGxvbmdlciwgYnV0IHNob3VsZCBzaG93IHVzZWZ1bCBpbnRlcm1lZGlhdGUgc3RhdGUgcmF0aGVyIHRoYW4gYSBnZW5lcmljIHNwaW5uZXIuCgpDdXJyZW50IHByb2R1Y3Rpb24gZXZpZGVuY2Ugc2hvd3MgdGhpcyBuZWVkcyBhcmNoaXRlY3R1cmFsIHdvcmsgcmF0aGVyIHRoYW4gVUkgcG9saXNoIGFsb25lLiBUaGUgZmlyc3QgcGFzcyB0aGVyZWZvcmUgZm9jdXNlcyBvbiBmYXN0ZXIgcm91dGluZywgcmVnaW9uYWwgZXhlY3V0aW9uLCBwYXJhbGxlbCBlbnRpdHkgcmVzb2x1dGlvbiBhbmQgZXhwbGljaXQgc3RhZ2UgdGVsZW1ldHJ5IHdoaWxlIHByZXNlcnZpbmcgZXhpc3RpbmcgaWRlbXBvdGVuY3ksIHJldmlldyBhbmQgZXZpZGVuY2Ugc2FmZWd1YXJkcy4KCiMjIENvbm5lY3RlZCBBSSBzdXJmYWNlcwoKIyMjIEhvbWUKREpNIHJhbmtzIHdoYXQgbWF0dGVycyBub3csIGV4cGxhaW5zIHdoeSwgYW5kIHByb3Bvc2VzIG9yIGV4ZWN1dGVzIHRoZSBuZXh0IHNhZmUgYWN0aW9uLgoKIyMjIFBsYXllcnMKREpNIGRldGVjdHMgc3RhbGUgZGF0YSwgbWlzc2luZyBldmlkZW5jZSwgY2hhbmdpbmcgbWFya2V0IGNvbnRleHQsIGNvbnRyYWN0dWFsIG1pbGVzdG9uZXMsIHBsYXllciBzZXJ2aWNlIGlzc3VlcyBhbmQgcmVsZXZhbnQgY2x1YiBkZW1hbmQuCgojIyMgUmVjcnVpdG1lbnQKREpNIGtlZXBzIHRhcmdldHMgZW5yaWNoZWQsIGRldGVjdHMgbWlzc2luZyBjb250ZXh0LCBwcmlvcml0aXNlcyBvdXRyZWFjaCwgZHJhZnRzIGZvbGxvdy11cHMgYW5kIGNvbm5lY3RzIHByb3NwZWN0cyB0byBsaXZlIG1hcmtldCBkZW1hbmQuCgojIyMgTmV0d29yawpESk0gdW5kZXJzdGFuZHMgcmVsYXRpb25zaGlwcyBvdmVyIHRpbWUsIHByZXBhcmVzIG1lZXRpbmcgY29udGV4dCwgZGV0ZWN0cyBjb29saW5nIHJlbGF0aW9uc2hpcHMsIGNhcHR1cmVzIG5ldyBpbnRlbGxpZ2VuY2UgYW5kIHJlbWVtYmVycyBwcm92ZW5hbmNlLgoKIyMjIE9wcG9ydHVuaXRpZXMgYW5kIGRlYWxzCkRKTSBkZXRlY3RzIGJsb2NrZXJzLCBtaXNzaW5nIG5leHQgYWN0aW9ucywgc3RhbGUgY29udmVyc2F0aW9ucywgZGVjaXNpb24gZGVhZGxpbmVzIGFuZCByZWxldmFudCBwZW9wbGUgb3IgcGxheWVycy4KCiMjIyBUZWxsIERKTQpUZWxsIERKTSBpcyB0aGUgZmFzdGVzdCB3cml0ZSBwYXRoIGludG8gdGhlIGVudGlyZSBzeXN0ZW0uIEEgdm9pY2Ugbm90ZSBvciB0eXBlZCBub3RlIGJlY29tZXMgbGlua2VkIGFnZW5jeSBtZW1vcnksIHRhc2tzLCBuZWVkcywgaW50ZXJhY3Rpb25zIGFuZCByZXZpZXcgaXRlbXMgd2l0aG91dCBmb3JjaW5nIHRoZSB1c2VyIHRocm91Z2ggZm9ybXMuCgojIyMgU2VhcmNoIGFuZCBjb21tYW5kClNlYXJjaCBldm9sdmVzIGludG8gYSB1bml2ZXJzYWwgY29tbWFuZCBzdXJmYWNlOiBmaW5kIGFueXRoaW5nLCBhc2sgYWJvdXQgYW55dGhpbmcgYW5kIGluaXRpYXRlIHNhZmUgYWN0aW9ucyB3aXRob3V0IGNoYW5naW5nIG1lbnRhbCBtb2Rlcy4KCiMjIENvbXBldGl0aXZlIHBvc2l0aW9uCgpESk0gc2hvdWxkIG5vdCBjb21wZXRlIGJ5IHRyeWluZyB0byBiZWNvbWUgYSBzZWNvbmQgdHJhbnNmZXIgbWFya2V0cGxhY2UuIFRoZSBkZWZlbnNpYmxlIHByb2R1Y3QgaXMgdGhlIHByaXZhdGUgaW50ZWxsaWdlbmNlIGFuZCBvcGVyYXRpbmcgbGF5ZXIgZm9yIGFuIGFnZW5jeS4KCkEgbWFya2V0cGxhY2UgY2FuIGtub3cgdGhlIG1hcmtldC4gREpNIHNob3VsZCBrbm93IHRoZSBhZ2VuY3k6IHdobyB3ZSByZXByZXNlbnQsIHdobyB3ZSB0cnVzdCwgd2hhdCB3YXMgc2FpZCwgd2hhdCBjaGFuZ2VkLCB3aGF0IGlzIGR1ZSwgd2hhdCBhIGNsdWIgbmVlZHMsIHdoaWNoIHJlbGF0aW9uc2hpcCBtYXR0ZXJzLCB3aGF0IGV2aWRlbmNlIHN1cHBvcnRzIGEgY2xhaW0sIHdoYXQgb3Bwb3J0dW5pdHkgaXMgcmVhbCBhbmQgd2hhdCB0aGUgdGVhbSBzaG91bGQgZG8gbmV4dC4KClRoYXQgY29ubmVjdGVkIHByaXZhdGUgY29udGV4dCBpcyB0aGUgY29yZSBhc3NldCBvZiB0aGUgd2hpdGUtbGFiZWwgU2FhUyBwcm9kdWN0LgoKIyMgRGVsaXZlcnkgc2VxdWVuY2UKCiMjIyBGb3VuZGF0aW9uCi0gQ2Fub25pY2FsIGVudGl0eSBjb250ZXh0LgotIFNoYXJlZCBBSSByb3V0aW5nIHBvbGljeS4KLSBDbGllbnQgYW5kIEVkZ2UgbGF0ZW5jeSB0ZWxlbWV0cnkuCi0gVGVsbCBESk0gZmFzdCBwYXRoLgotIEZpbmFsIERKTSBPUyB2aXN1YWwgb3ZlcnJpZGUgbGF5ZXIuCgojIyMgQ29ubmVjdGVkIGNvbW1hbmQgc3lzdGVtCi0gTWVyZ2Ugc2VhcmNoLCBjYXB0dXJlIGFuZCBBSSBjb21tYW5kIGVudHJ5IHBvaW50cyBpbnRvIG9uZSBjb21tYW5kIHN1cmZhY2UuCi0gQ29udGV4dC1hd2FyZSBhY3Rpb25zIG9uIGV2ZXJ5IGVudGl0eSBwYWdlLgotIEtleWJvYXJkLWZpcnN0IG5hdmlnYXRpb24gYW5kIGFjdGlvbnMuCgojIyMgQWdlbmN5IGludGVsbGlnZW5jZSBsb29wCi0gQUktcmFua2VkIEhvbWUgZmVlZC4KLSBBdXRvbWF0ZWQgbWVldGluZyBicmllZnMgYW5kIGZvbGxvdy11cCBwcmVwYXJhdGlvbi4KLSBJbnRlbGxpZ2VudCByZWNydWl0bWVudCBwcmlvcml0aXNhdGlvbi4KLSBQbGF5ZXIgZnJlc2huZXNzIGFuZCBldmlkZW5jZSBhdXRvbWF0aW9uLgotIERlYWwgYmxvY2tlciBhbmQgbmV4dC1hY3Rpb24gZGV0ZWN0aW9uLgoKIyMjIFdoaXRlLWxhYmVsIGludGVsbGlnZW5jZQotIFRlbmFudC1hd2FyZSBwb2xpY2llcywgbW9kZWxzLCB1c2FnZSwgZmVhdHVyZXMgYW5kIGF1dG9tYXRpb24gbGltaXRzLgotIEFnZW5jeS1zcGVjaWZpYyBtZW1vcnkgYW5kIHZvY2FidWxhcnkuCi0gUGxhbi1iYXNlZCBBSSBjYXBhYmlsaXR5IHJvdXRpbmcuCi0gRGVkaWNhdGVkIGRhdGEgYm91bmRhcmllcyBhbmQgYXVkaXRhYmlsaXR5LgoKIyMgTm9uLW5lZ290aWFibGVzCgotIFByb2R1Y3Rpb24gc3RheXMgcHJvdGVjdGVkIHVudGlsIHN0YWdpbmcgcGFyaXR5IGlzIGNvbXBsZXRlLgotIE5vIHByaXZhdGUgcGxheWVyIG9yIGFnZW5jeSBkYXRhIGlzIGNvbW1pdHRlZCB0byBHaXQuCi0gTm8gQUkgYWN0aW9uIGJ5cGFzc2VzIHRoZSBleGlzdGluZyBldmlkZW5jZSBhbmQgcmV2aWV3IHNhZmVndWFyZHMuCi0gTm8gbmV3IEFJIGZlYXR1cmUgY3JlYXRlcyBpdHMgb3duIGRpc2Nvbm5lY3RlZCBtZW1vcnkgb3IgaWRlbnRpdHkgc3lzdGVtLgotIE5vIHZpc3VhbCByZWRlc2lnbiBicmVha3MgcGxheWVyLWZhY2luZyBmbG93cyBmb3IgdGhlIHNha2Ugb2Ygc3RhZmYtc2lkZSBwb2xpc2guCg=="
};

function absolute(file) {
  return path.join(ROOT, file);
}

function read(file) {
  return fs.readFileSync(absolute(file), 'utf8');
}

function gitBlobSha(content) {
  const bytes = Buffer.from(content, 'utf8');
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([header, bytes])).digest('hex');
}

function fail(message) {
  console.error(`\nDJM intelligence patch stopped: ${message}`);
  process.exit(1);
}

function replaceOnce(content, before, after, label) {
  const first = content.indexOf(before);
  if (first < 0) fail(`could not find ${label}`);
  if (content.indexOf(before, first + before.length) >= 0) {
    fail(`found more than one match for ${label}`);
  }
  return content.slice(0, first) + after + content.slice(first + before.length);
}

function replaceRegexOnce(content, pattern, after, label) {
  const matches = [...content.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'))];
  if (matches.length !== 1) fail(`expected one match for ${label}, found ${matches.length}`);
  return content.replace(pattern, after);
}

const current = {};
for (const [file, sha] of Object.entries(expectedBlobs)) {
  if (!fs.existsSync(absolute(file))) fail(`missing ${file}`);
  const content = read(file);
  const actual = gitBlobSha(content);
  if (actual !== sha) {
    fail(`${file} changed since audit. Expected blob ${sha}, found ${actual}. Re-audit instead of forcing this patch.`);
  }
  current[file] = content;
}

for (const file of Object.keys(newFilesB64)) {
  if (fs.existsSync(absolute(file))) {
    fail(`${file} already exists. Re-audit before applying.`);
  }
}

const next = { ...current };

// Root visual layer imports last so it can safely normalise legacy staff-side CSS.
next['app/layout.tsx'] = replaceOnce(
  next['app/layout.tsx'],
  "import './staff-mobile-layout-fix.css';\n",
  "import './staff-mobile-layout-fix.css';\nimport './djm-os-v3.css';\n",
  'DJM OS v3 CSS import',
);

// Add client-side latency telemetry and pin Tell DJM data-heavy work to the DB region.
next['lib/djm-os.ts'] = replaceOnce(
  next['lib/djm-os.ts'],
  "import { supabase } from '@/lib/supabase';\n",
  "import { supabase } from '@/lib/supabase';\nimport { measureDjmOperation } from '@/lib/djm-performance';\n",
  'djm performance import',
);

next['lib/djm-os.ts'] = replaceRegexOnce(
  next['lib/djm-os.ts'],
  /export async function djmRpc<T = any>\([\s\S]*?\n}\n\nexport async function djmInvoke<T = any>\(/,
  `export async function djmRpc<T = any>(
  name: string,
  args: Record<string, any> = {},
): Promise<T> {
  return measureDjmOperation('rpc', name, async () => {
    const { data, error } = await supabase.rpc(name as any, args as any);

    if (error) {
      throw new Error(error.message || \`DJM request failed: \${name}\`);
    }

    return data as T;
  });
}

export async function djmInvoke<T = any>(`,
  'djmRpc wrapper',
);

next['lib/djm-os.ts'] = replaceRegexOnce(
  next['lib/djm-os.ts'],
  /export async function djmInvoke<T = any>\([\s\S]*?\n}\n\nexport const compactDate/,
  `export async function djmInvoke<T = any>(
  functionName: string,
  body: FormData | Record<string, any>,
): Promise<T> {
  return measureDjmOperation('edge', functionName, async () => {
    const options: any = { body };
    if (functionName === 'djm-tell-capture' || functionName === 'djm-tell-process') {
      options.region = 'eu-west-1';
    }

    const { data, error } = await supabase.functions.invoke(functionName, options);

    if (error) {
      let message = error.message || \`DJM function failed: \${functionName}\`;
      const context = (error as any)?.context;

      if (context && typeof context.clone === 'function') {
        try {
          const response = context.clone();
          const payload = await response.json();
          message = payload?.error || payload?.message || message;
        } catch {
          try {
            const response = context.clone();
            const text = await response.text();
            if (text?.trim()) message = text.trim();
          } catch {
            // Keep the original functions error message.
          }
        }
      }

      throw new Error(message);
    }

    return data as T;
  });
}

export const compactDate`,
  'djmInvoke wrapper',
);

// Canonical route/entity context for every AI entry point.
next['components/DjmTellDjmLauncher.tsx'] = replaceOnce(
  next['components/DjmTellDjmLauncher.tsx'],
  "import { djmRpc } from '@/lib/djm-os';\n",
  "import { djmRpc } from '@/lib/djm-os';\nimport {\n  contextFromRoute,\n  mergeDjmContext,\n  tellDjmHref,\n  type DjmEntityContext,\n} from '@/lib/djm-context';\n",
  'Tell DJM launcher context import',
);

next['components/DjmTellDjmLauncher.tsx'] = replaceRegexOnce(
  next['components/DjmTellDjmLauncher.tsx'],
  /type TellContext = \{[\s\S]*?function fullScreenHref\(pathname: string, context: TellContext\) \{[\s\S]*?\n\}\n\nexport default function DjmTellDjmLauncher/,
  'export default function DjmTellDjmLauncher',
  'duplicated Tell DJM launcher context helpers',
);
next['components/DjmTellDjmLauncher.tsx'] = next['components/DjmTellDjmLauncher.tsx'].replaceAll('TellContext', 'DjmEntityContext');
next['components/DjmTellDjmLauncher.tsx'] = next['components/DjmTellDjmLauncher.tsx'].replaceAll('fallbackContext(', 'contextFromRoute(');
next['components/DjmTellDjmLauncher.tsx'] = next['components/DjmTellDjmLauncher.tsx'].replaceAll('fullScreenHref(', 'tellDjmHref(');
next['components/DjmTellDjmLauncher.tsx'] = replaceOnce(
  next['components/DjmTellDjmLauncher.tsx'],
  "    () => ({ ...routeContext, ...(workspaceContext || {}) }),\n",
  "    () => mergeDjmContext(routeContext, workspaceContext),\n",
  'Tell DJM merged context',
);
next['components/DjmTellDjmLauncher.tsx'] = replaceOnce(
  next['components/DjmTellDjmLauncher.tsx'],
  "    setRouteContext(routeFallback);\n    if (!open) return;\n\n    let active = true;",
  "    setRouteContext(routeFallback);\n\n    let active = true;",
  'Tell DJM eager context resolution',
);
next['components/DjmTellDjmLauncher.tsx'] = replaceOnce(
  next['components/DjmTellDjmLauncher.tsx'],
  "  }, [open, pathname, routeFallback]);\n",
  "  }, [pathname, routeFallback]);\n",
  'Tell DJM context effect dependencies',
);

next['components/TellDjmFullPage.tsx'] = replaceOnce(
  next['components/TellDjmFullPage.tsx'],
  "import { djmRpc } from '@/lib/djm-os';\n",
  "import { djmRpc } from '@/lib/djm-os';\nimport {\n  contextFromRoute,\n  contextFromSearchParams,\n  DJM_UUID_PATTERN,\n  mergeDjmContext,\n  type DjmEntityContext,\n} from '@/lib/djm-context';\n",
  'Tell DJM full page context import',
);
next['components/TellDjmFullPage.tsx'] = replaceRegexOnce(
  next['components/TellDjmFullPage.tsx'],
  /type TellContext = \{[\s\S]*?function fallbackContext\(pathname: string\): TellContext \{[\s\S]*?\n\}\n\nexport default function TellDjmFullPage/,
  'export default function TellDjmFullPage',
  'duplicated Tell DJM full page context helpers',
);
next['components/TellDjmFullPage.tsx'] = next['components/TellDjmFullPage.tsx'].replaceAll('TellContext', 'DjmEntityContext');
next['components/TellDjmFullPage.tsx'] = next['components/TellDjmFullPage.tsx'].replaceAll('fallbackContext(', 'contextFromRoute(');
next['components/TellDjmFullPage.tsx'] = replaceOnce(
  next['components/TellDjmFullPage.tsx'],
  "    () => ({ ...routeContext, ...queryContext }),\n",
  "    () => mergeDjmContext(routeContext, queryContext),\n",
  'Tell DJM full page merged context',
);
next['components/TellDjmFullPage.tsx'] = replaceRegexOnce(
  next['components/TellDjmFullPage.tsx'],
  /    const inlineContext: DjmEntityContext = \{\};[\s\S]*?    setQueryContext\(inlineContext\);\n/,
  "    setQueryContext(contextFromSearchParams(params));\n",
  'Tell DJM query context parsing',
);
next['components/TellDjmFullPage.tsx'] = replaceOnce(
  next['components/TellDjmFullPage.tsx'],
  "    if (\n      requestedCaptureId &&\n      new RegExp(`^${UUID}$`).test(requestedCaptureId)\n    ) {",
  "    if (requestedCaptureId && DJM_UUID_PATTERN.test(requestedCaptureId)) {",
  'Tell DJM capture UUID validation',
);

// Kick Tell DJM processing in the database region and keep failures observable.
next['supabase/functions/djm-tell-capture/index.ts'] = replaceOnce(
  next['supabase/functions/djm-tell-capture/index.ts'],
  `          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify({ capture_id: captureId, mode: "process" }),
        }).catch(() => undefined),`,
  `          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
            "x-region": "eu-west-1",
          },
          body: JSON.stringify({ capture_id: captureId, mode: "process" }),
        }).catch((error) => {
          console.warn(JSON.stringify({
            operation: "djm_tell_kick_worker",
            capture_id: captureId,
            error: error instanceof Error ? error.message : "Worker kick failed",
          }));
        }),`,
  'Tell DJM worker regional kick',
);

// Shared model routing and accurate model-specific cost estimation.
next['supabase/functions/djm-tell-process/index.ts'] = replaceOnce(
  next['supabase/functions/djm-tell-process/index.ts'],
  'import { createClient } from "jsr:@supabase/supabase-js@2";\n',
  'import { createClient } from "jsr:@supabase/supabase-js@2";\nimport { estimateDjmAiCost, selectDjmAiRoute } from "../_shared/djm-ai-router.ts";\n',
  'DJM AI router import',
);
next['supabase/functions/djm-tell-process/index.ts'] = replaceOnce(
  next['supabase/functions/djm-tell-process/index.ts'],
  'async function interpret(\n  openAiKey: string,\n  model: string,\n  capture: any,\n  transcript: string,\n) {\n',
  'async function interpret(\n  openAiKey: string,\n  model: string,\n  reasoningEffort: "none" | "low" | "medium",\n  capture: any,\n  transcript: string,\n) {\n',
  'Tell DJM interpretation reasoning signature',
);
next['supabase/functions/djm-tell-process/index.ts'] = replaceOnce(
  next['supabase/functions/djm-tell-process/index.ts'],
  '      reasoning: { effort: "none" },\n',
  '      reasoning: { effort: reasoningEffort },\n',
  'Tell DJM adaptive reasoning effort',
);
next['supabase/functions/djm-tell-process/index.ts'] = replaceOnce(
  next['supabase/functions/djm-tell-process/index.ts'],
  '  let transcript = String(capture?.transcript_text || "").trim();\n',
  '  let transcript = String(capture?.transcript_text || "").trim();\n  const timings: Record<string, number> = {};\n',
  'Tell DJM timing accumulator',
);
next['supabase/functions/djm-tell-process/index.ts'] = replaceOnce(
  next['supabase/functions/djm-tell-process/index.ts'],
  '    transcript = await transcribe(openAiKey, admin, capture, vocabulary);\n',
  '    const transcriptionStarted = performance.now();\n    transcript = await transcribe(openAiKey, admin, capture, vocabulary);\n    timings.transcription_ms = Math.round(performance.now() - transcriptionStarted);\n',
  'Tell DJM transcription timing',
);
next['supabase/functions/djm-tell-process/index.ts'] = replaceOnce(
  next['supabase/functions/djm-tell-process/index.ts'],
  '          transcription_cost_usd: Number(transcriptionCost.toFixed(6)),\n          estimated_cost_usd: Number(transcriptionCost.toFixed(6)),\n',
  '          transcription_cost_usd: Number(transcriptionCost.toFixed(6)),\n          transcription_ms: timings.transcription_ms || 0,\n          estimated_cost_usd: Number(transcriptionCost.toFixed(6)),\n',
  'Tell DJM stored transcription timing',
);
next['supabase/functions/djm-tell-process/index.ts'] = replaceOnce(
  next['supabase/functions/djm-tell-process/index.ts'],
  '      modelUsage: capture.usage_json || {},\n',
  '      modelUsage: { ...(capture.usage_json || {}), ...timings },\n',
  'Tell DJM reused plan timing',
);
next['supabase/functions/djm-tell-process/index.ts'] = replaceRegexOnce(
  next['supabase/functions/djm-tell-process/index.ts'],
  /  const \{ plan, usage \} = await interpret\([\s\S]*?  const estimatedCost = existingTranscriptionCost \+ modelCost;\n/,
  `  const aiRoute = selectDjmAiRoute('tell_djm', { text: transcript });
  const interpretationStarted = performance.now();
  const { plan, usage } = await interpret(
    openAiKey,
    aiRoute.model,
    aiRoute.reasoning_effort,
    capture,
    transcript,
  );
  timings.interpretation_ms = Math.round(
    performance.now() - interpretationStarted,
  );

  const inputTokens = Number(usage?.input_tokens || 0);
  const outputTokens = Number(usage?.output_tokens || 0);
  const settings = capture.settings || {};
  const modelCost = estimateDjmAiCost(aiRoute, inputTokens, outputTokens);
  const existingTranscriptionCost = Number(
    capture?.usage_json?.transcription_cost_usd ||
      ((Number(capture.duration_seconds || 0) / 60) *
        Number(settings.transcription_usd_per_minute || 0.0045)),
  );
  const estimatedCost = existingTranscriptionCost + modelCost;
`,
  'Tell DJM adaptive interpretation routing',
);
next['supabase/functions/djm-tell-process/index.ts'] = replaceOnce(
  next['supabase/functions/djm-tell-process/index.ts'],
  '    p_usage: {\n      input_tokens: inputTokens,\n      output_tokens: outputTokens,\n      interpretation_cost_usd: Number(modelCost.toFixed(6)),\n      estimated_cost_usd: Number(estimatedCost.toFixed(6)),\n    },\n  });\n',
  '    p_usage: {\n      input_tokens: inputTokens,\n      output_tokens: outputTokens,\n      interpretation_cost_usd: Number(modelCost.toFixed(6)),\n      interpretation_model: aiRoute.model,\n      interpretation_tier: aiRoute.tier,\n      interpretation_ms: timings.interpretation_ms || 0,\n      estimated_cost_usd: Number(estimatedCost.toFixed(6)),\n    },\n  });\n',
  'Tell DJM stored interpretation route',
);
next['supabase/functions/djm-tell-process/index.ts'] = replaceOnce(
  next['supabase/functions/djm-tell-process/index.ts'],
  '    modelUsage: {\n      input_tokens: inputTokens,\n      output_tokens: outputTokens,\n      interpretation_cost_usd: Number(modelCost.toFixed(6)),\n      estimated_cost_usd: Number(estimatedCost.toFixed(6)),\n    },\n    reusedPlan: false,\n',
  '    modelUsage: {\n      input_tokens: inputTokens,\n      output_tokens: outputTokens,\n      interpretation_cost_usd: Number(modelCost.toFixed(6)),\n      interpretation_model: aiRoute.model,\n      interpretation_tier: aiRoute.tier,\n      interpretation_ms: timings.interpretation_ms || 0,\n      transcription_ms: timings.transcription_ms || 0,\n      estimated_cost_usd: Number(estimatedCost.toFixed(6)),\n    },\n    reusedPlan: false,\n',
  'Tell DJM returned interpretation route',
);
next['supabase/functions/djm-tell-process/index.ts'] = replaceOnce(
  next['supabase/functions/djm-tell-process/index.ts'],
  '  try {\n    const { transcript, plan, modelUsage } = await getPlan(\n',
  '  try {\n    const processingStarted = performance.now();\n    const { transcript, plan, modelUsage } = await getPlan(\n',
  'Tell DJM processing timer start',
);
next['supabase/functions/djm-tell-process/index.ts'] = replaceOnce(
  next['supabase/functions/djm-tell-process/index.ts'],
  '      capture,\n    );\n\n    const actionKeys = new Set<string>();\n',
  '      capture,\n    );\n    const actionStarted = performance.now();\n\n    const actionKeys = new Set<string>();\n',
  'Tell DJM action timer start',
);
next['supabase/functions/djm-tell-process/index.ts'] = replaceRegexOnce(
  next['supabase/functions/djm-tell-process/index.ts'],
  /      const club = await resolveEntity\([\s\S]*?      const prospect = await resolveEntity\(\n        admin,\n        capture,\n        "prospect",\n        isScoutObservation \? action\.player_name : null,\n        action\.player_current_club,\n      \);/,
  `      const clubPromise = resolveEntity(
        admin,
        capture,
        "club",
        isScoutObservation ? null : action.club_name,
      );
      const playerPromise = resolveEntity(
        admin,
        capture,
        "player",
        isScoutObservation ? null : action.player_name,
      );
      const prospectPromise = resolveEntity(
        admin,
        capture,
        "prospect",
        isScoutObservation ? action.player_name : null,
        action.player_current_club,
      );

      const club = await clubPromise;
      const contactPromise = resolveEntity(
        admin,
        capture,
        "contact",
        action.contact_name,
        action.club_name || club.label || capture?.context_json?.organisation_name || null,
      );
      const [contact, player, prospect] = await Promise.all([
        contactPromise,
        playerPromise,
        prospectPromise,
      ]);`,
  'parallel Tell DJM entity resolution',
);
next['supabase/functions/djm-tell-process/index.ts'] = replaceOnce(
  next['supabase/functions/djm-tell-process/index.ts'],
  '    const usage = {\n      ...(capture.usage_json || {}),\n      ...(modelUsage || {}),\n    };\n',
  '    const actionApplicationMs = Math.round(performance.now() - actionStarted);\n    const usage = {\n      ...(capture.usage_json || {}),\n      ...(modelUsage || {}),\n      action_application_ms: actionApplicationMs,\n      processing_elapsed_ms: Math.round(performance.now() - processingStarted),\n    };\n',
  'Tell DJM action and total timing',
);

// Validate that the final sources still avoid the character rejected by the repo guard.
const emDash = String.fromCharCode(0x2014);
for (const [file, content] of Object.entries(next)) {
  if (content.includes(emDash)) fail(`${file} contains an em dash`);
}
for (const [file, encoded] of Object.entries(newFilesB64)) {
  const content = Buffer.from(encoded, 'base64').toString('utf8');
  if (content.includes(emDash)) fail(`${file} contains an em dash`);
}

console.log('DJM Intelligence Foundation v1');
console.log(`Mode: ${APPLY ? 'APPLY' : 'CHECK ONLY'}`);
console.log('Verified audited blobs:');
for (const file of Object.keys(expectedBlobs)) console.log(`  OK  ${file}`);
console.log('Planned new files:');
for (const file of Object.keys(newFilesB64)) console.log(`  NEW ${file}`);
console.log('Planned updated files:');
for (const file of Object.keys(next)) console.log(`  MOD ${file}`);

if (!APPLY) {
  console.log('\nNo files changed. Run again with --apply after reviewing this check.');
  process.exit(0);
}

for (const [file, content] of Object.entries(next)) {
  fs.writeFileSync(absolute(file), content, 'utf8');
}
for (const [file, encoded] of Object.entries(newFilesB64)) {
  fs.mkdirSync(path.dirname(absolute(file)), { recursive: true });
  fs.writeFileSync(absolute(file), Buffer.from(encoded, 'base64').toString('utf8'), 'utf8');
}

console.log('\nPatch applied to the working tree only. Nothing was deployed or merged.');
console.log('Next: npm test && npm run typecheck && npm run build');
