# SwissTarget 宣传素材 / Media kit

## 下载素材

- [中文封面 · 1280 × 640](media/social-cover.png)：GitHub Social Preview、项目介绍、社交分享。
- [英文封面 · 1280 × 640](media/social-cover-en.png)。
- [中文面板](media/panel-zh.png)、[英文面板](media/panel-en.png)、[深色面板](media/panel-dark.png)、[手机界面](media/panel-mobile.png)。
- [矢量图标](../icon.svg)。

截图使用真实 `client.js` 组件与模拟宿主，数据为示例。不要作为实验结果或真实预测输出发布。封面并非 SIB 官方物料，不暗示官方合作。封面可在 GitHub 仓库 Settings → General → Social preview 上传。

## 中文发布文案

从分子出发，让靶点更清晰。

为 DeepSeek Harness 做了一个 SwissTargetPrediction 批量预测插件：粘贴一组 SMILES，自动处理盐型、逐个提交预测，把靶点、基因名、UniProt / ChEMBL 编号和概率汇总成表格，再导出 CSV。

支持 Agent 调用、`/swiss` 命令和可视化面板，支持人、小鼠、大鼠以及中英文界面。运行期间切换标签或会话，回来仍能查看进度和结果。

项目：https://github.com/YumeAyai/dsh-swiss-target

非官方客户端；截图为演示数据；预测仅供研究线索参考，不等同于实验证据。

## English announcement

SMILES in. Targets out.

SwissTarget for DeepSeek Harness brings batch protein target predictions into your research workspace. Paste SMILES, preprocess salts, review target names, gene names, UniProt / ChEMBL IDs and probabilities, then export CSV.

Use it through an Agent, the `/swiss` command, or the visual panel. Supports human, mouse and rat, with English and Chinese interfaces and session-preserved progress and results.

Project: https://github.com/YumeAyai/dsh-swiss-target

Unofficial client. Screenshots use illustrative data. Predictions are research leads, not experimental evidence.

## 验证记录

独立演示环境已检查中英文与深色渲染、模拟结果、CSV 下载、清空、错误提示、390px 窄屏无整页横向溢出；浏览器无运行错误。尚未验证真实 Harness 宿主中的加载、主题和远程预测。
