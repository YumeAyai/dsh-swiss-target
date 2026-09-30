# SwissTargetPrediction 批量预测 —— DeepSeek Harness 插件与 Agent Skill

[English](README.md) | [中文](README_zh.md)

想知道一个分子——或一整批分子——可能作用在哪些蛋白上？把 SMILES 交给它。它会逐个提交到
[SwissTargetPrediction](https://www.swisstargetprediction.ch/)，等服务算完，把结果整理成一张表：
靶点名、基因名、UniProt 与 ChEMBL 编号、靶点类别、概率，以及每个靶点已有的已知活性数（3D/2D）。
同一张表还会写成 CSV 存到会话工作区。

> **注意**：本工具**非官方**，与[瑞士生物信息研究所（SIB）](https://www.sib.swiss/) 无关，
> 请遵守对方的服务使用政策。若预测结果用于研究，请引用 Daina, Michielin & Zoete,
> *Nucleic Acids Research* 47(W1), W357–W364 (2019)。

## 能做什么

- **一次提交一整批。** SMILES 一行一个粘进去，提交、等结果、汇总都由它来做。
- **一张表看全服务给的信息。** 靶点名、基因名、UniProt 与 ChEMBL 编号、靶点类别、概率、
  已知活性数（3D/2D）。
- **盐型不用自己拆。** 盐酸盐、钠盐这类成盐形式会在提交前自动去掉反离子，该中和的顺带中和，
  改了什么会列给你看。SwissTargetPrediction 一次只接受一个分子，盐型直接粘过去只会失败。
- **三种用法。** 让 Agent 跑；在输入框敲 `/swiss`；或打开 SwissTarget 面板粘贴列表。
- **不用干等。** 运行时有进度和已用时间；切走再回来结果还在；失败的分子会写清原因。
- **可选人 / 小鼠 / 大鼠。**
- **结果能存下来。** 整张表写进会话工作区的 CSV，面板里也能导出。
- **界面中英文。**

## 安装

装进某个 profile。直接从 release 装，不用克隆：

```bash
dsh plugin --profile <profile> add https://github.com/YumeAyai/dsh-swiss-target/releases/latest/download/dsh-swiss-target.tar.gz
```

也可以从仓库装，或从你已经拿到的目录装：

```bash
dsh plugin --profile <profile> add github:YumeAyai/dsh-swiss-target
dsh plugin --profile <profile> add /绝对路径/到/本目录
```

作为 Agent 技能安装（同一个目录本身就是技能包）：

```bash
git clone https://github.com/YumeAyai/dsh-swiss-target.git ~/.dsh/skills/dsh-swiss-target
```

## 用法

### 让 Agent 跑

```text
swiss_target_batch(smiles=["CC(=O)OC1=CC=CC=C1C(=O)O", "CN1C=NC2=C1C(=O)N(C(=O)N2C)C"])
```

| 参数 | 默认值 | 含义 |
|---|---|---|
| `smiles` | 必填 | 每个元素一个 SMILES，单次最多 25 个 |
| `organism` | `Homo_sapiens` | 还可选 `Mus_musculus`、`Rattus_norvegicus` |
| `output_csv` | `swiss_target_results.csv` | 相对会话工作区，或绝对路径 |

### 在输入框里跑

```text
/swiss CC(=O)OC1=CC=CC=C1C(=O)O
/swiss {"smiles":["CCO","c1ccccc1"],"organism":"Homo_sapiens"}
```

每行一个 SMILES（`#` 开头为注释），或者用面板发送的那种 JSON。

### 在面板里跑

打开会话 → 在会话视图标签里选 **SwissTarget** → 每行粘贴一个 SMILES → 选物种 → 运行。
结果显示成表格，点 **导出 CSV** 可以下载；主机端同时会把整批结果写进工作区。

运行期间显示进度和已用时间（单个分子 5–60 秒都算正常）。切到别的标签页或会话再回来，
草稿和结果都还在。

## 输出示例

| 靶点 | 基因名 | UniProt | ChEMBL | 类别 | 概率* | 已知活性（3D/2D） | 输入 SMILES |
|---|---|---|---|---|---|---|---|
| Cyclooxygenase-1 | PTGS1 | P23219 | CHEMBL221 | Oxidoreductase | 0.756 | 13 / 2 | CC(=O)OC1=CC=CC=C1C(=O)O |

## 盐型与混合物

多数药物活性成分本身就是盐（盐酸盐、钠盐、酒石酸盐……），而 SwissTargetPrediction 一次只接受
一个分子：直接粘 `[Cl-].CC(=O)Oc1ccccc1C(=O)O` 不会得到结果。所以每一行在提交前会先转换：

| 你输入 | 实际提交 | 处理 |
|---|---|---|
| `[Cl-].CC(=O)Oc1ccccc1C(=O)O` | `CC(=O)Oc1ccccc1C(=O)O` | 去掉氯离子 |
| `CN(C)CCOC(c1ccccc1)c1ccccc1.Cl` | `CN(C)CCOC(c1ccccc1)c1ccccc1` | 去掉中性的 HCl 加合物 |
| `CC(=O)[O-].[Na+]` | `CC(=O)O` | 去掉钠离子，羧酸根中和 |
| `[Na+].[O-]C(=O)c1ccccc1O` | `OC(=O)c1ccccc1O` | 去掉钠离子，酚/羧酸根中和 |
| `[NH3+]CC(=O)[O-]` | `NCC(=O)O` | 两性离子中和 |
| `C[N+](C)(C)CCOC(c1ccccc1)c1ccccc1.[Cl-]` | 季铵母体 | 去掉氯离子，电荷保留（没有氢可脱） |
| `CCO.c1ccccc1` | `c1ccccc1` | 真是混合物：留最大片段，其余如实说明 |
| `[Na+].[Cl-]` | — | 拒绝：整行都是反离子 |

不会替你改结构：默认只去反离子、只中和能安全中和的电荷；硝基、季铵这类不做动作，原样提交。
原始输入和实际提交的分子在 CSV 里各占一列（`input_smiles` / `submitted_smiles`），
工具结果和面板里也会列出每一次改动。

## 注意事项

- **服务会限流。** 连续提交一批之后，它有一段时间会拒绝新任务。客户端对每个分子重试 3 次，
  仍失败就把这个分子连同原因标为失败，其余继续跑完。稍后重跑失败的分子即可。
- **上限。** 单次最多 25 个分子；每个分子最多返回服务自己的前 100 个靶点。
- **耗时。** 逐个提交、每个之间间隔 2 秒；单个分子通常 5–60 秒。
- **物种。** 人（默认）、小鼠、大鼠。
- **结果是预测，不是实验证据。**

## 许可

本代码采用 ISC 许可证发布。
预测结果及数据版权归属 SwissTargetPrediction / SIB 所有。

移植自 Python 客户端 [swiss_target_batch](https://github.com/YumeAyai/swiss_target_batch)，
原始源码与它自己的安装说明都在那边。
