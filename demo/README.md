# Local UI demo / 本地界面演示

Open `demo/index.html` directly in a browser. The checked-in `preview.js` makes the demo usable without installing packages. It loads the real `client.js` panel through a mocked Harness registration layer. The demo never calls SwissTargetPrediction.

直接用浏览器打开 `demo/index.html`，粘贴任意 SMILES 后点击开始预测。结果固定为示例数据；不请求预测服务。模拟层用于验证界面，不验证 Harness 宿主集成、登录或真实服务响应。

Query options: `?lang=en`, `?theme=dark`, `?state=error`; combine them with `&`.

To rebuild after editing `preview.jsx`:

```sh
npm install
npm run build:demo
```

To serve the preview (optional):

```sh
python3 -m http.server 8765
```

Open `http://localhost:8765/demo/`. Production plugin loading still uses `client.js` directly; demo dependencies are development-only. `demo/cover.html` and `demo/cover-en.html` are editable 1280 × 640 promotional cover sources.
