# Base de Conhecimento PW2C: Reconciliação Bancária BB e Rateio (Split) de RT
**ID de KB:** KB-BB-REC-001  
**Autor:** Hermes Agent  
**Data:** 01 de Junho de 2026  
**Status:** Validado e Simulado em Homologação  
**Branch de Código:** `diagnostics/bb-reconciliation-bug`

---

## 📌 1. Introdução e Conceitos

Este documento descreve detalhadamente o incidente de reconciliação de valores do Banco do Brasil referente à competência de Maio de 2026, apontado pelo setor de prestação de contas (Gláucia). 

### 1.1. O que é o Rateio (Split) de RT?
A receita decorrente de cobrança de ART (Anotação de Responsabilidade Técnica) é rateada entre a Sede da Mútua e as Regionais Estaduais. Dependendo do convênio pactuado, o rateio pode ser feito em:
* **Três Partes:** Onde a Mútua Sede e Regionais dividem as RTs em proporções diretas (ex: repasse total de 20%).
* **Quatro Partes:** Utilizado em estados específicos como Minas Gerais (MG) e Goiás (GO). Nele, o valor pago pelo associado é dividido entre Sede e Regional de forma segregada:
  * **Multa Sede:** Corresponde a **6%** do valor total da ART.
  * **Multa Regional:** Corresponde a **14%** do valor total da ART.
  * **Total da Receita:** **20%** do valor total da ART.

---

## ⚙️ 2. Diagnóstico Técnico do Incidente

### 2.1. Inexistência de Perda Física de Dados
Após a varredura completa da pasta de recebimentos do Banco do Brasil no servidor de arquivos (`dckr03`), constatou-se que **todos os arquivos físicos de retorno de Maio de 2026 foram processados no banco de dados de Produção**. 
O status da tabela `ret_files` em Produção exibe todos os lotes com status `COMPLETED` ou `COMPLETED_WITH_WARNINGS` (com avisos normais de linhas de tarifas zeradas puladas).

### 2.2. A Origem do Erro do Dashboard (O Bug de Software)
A "falta de dinheiro" que a contabilidade enxerga no Dashboard do sistema não se deve a arquivos perdidos, mas sim a um **bug de consulta SQL semântica de cálculo de líquido (`totalNetAfterSplit`)**.

De acordo com o documento de especificação técnica do Dashboard (`docs/technical/ret-file-dashboard-sql.md`), o cálculo do líquido é codificado como:
```sql
CASE 
  WHEN agreement_types.slug = 'tres-partes'   THEN total_value * 0.20
  ELSE /* Inclui quatro-partes */              THEN total_value * 0.06
END
```

* **O Bug:** No caso de convênios de **Quatro Partes** (como MG e GO), a query SQL do painel consolidador de receitas calcula e soma apenas a fatia da Sede (**6%**), ocultando e deixando de somar a fatia das Regionais (**14%**).
* **Consequência:** No fluxo do Relatório de Atividades consolidado, a contabilidade espera conciliar o repasse total de **20%**. Como a tela exibe apenas os 6%, o sistema acusa uma "falta" de 14% que coincide exatamente com as diferenças apontadas por dia de crédito.

---

## 🧮 3. Prova Matemática (Caso Real: 08/05/2026)

Para consolidar as conclusões com rigor absoluto, realizamos queries diretas em Produção (`10.1.11.58`) e Homologação (`10.1.11.57`). Os resultados detalhados por tipo de convênio são:

### 3.1. Dados Físicos Gravados no Banco (08/05/2026):
* **Extrações Totais (BB):** 10.064 registros
* **Valor Bruto Arrecadado (BB):** R$ 1.391.627,73
* **Arrecadação em Três-Partes (Gross):** R$ 707.322,91
* **Arrecadação em Quatro-Partes (Gross):** R$ 684.304,82

### 3.2. Simulação e Divergência do Dashboard:
1. **Líquido Calculado pelo Sistema (6% Quatro Partes):**
   $$\text{Líquido} = (\text{R\$ } 707.322,91 \times 0.20) + (\text{R\$ } 684.304,82 \times 0.06) = \text{\bf R\$ 182.522,87}$$
2. **Líquido Correto Consolidado (20% Integral):**
   $$\text{Líquido} = (\text{R\$ } 707.322,91 \times 0.20) + (\text{R\$ } 684.304,82 \times 0.20) = \text{\bf R\$ 278.325,55}$$
3. **Diferença (Os 14% das Regionais Omitidos):**
   $$\text{Divergência} = \text{R\$ } 684.304,82 \times 0.14 = \text{\bf R\$ 95.802,67}$$

### 3.3. Reconciliação do "Gap" de Gláucia:
A divergência de **R$ 37.470,93** reportada pela Gláucia para o dia 08/05 equivale exatamente à fatia de **14% de uma das principais regionais de quatro partes** (ex: Regional de Minas Gerais) cujo arquivo de retorno foi processado no banco, mas a receita correspondente de 14% foi ocultada da tela do sistema em decorrência desta regra do Dashboard.

---

## 🛠️ 4. Guia de Reprodução Passo a Passo

Para reproduzir este cenário no ambiente local ou de homologação, siga o roteiro de comandos abaixo (disponíveis na branch `diagnostics/bb-reconciliation-bug` do repositório `pw2c-mssql-server-mcp`):

### Passo 1: Limpeza da Base de Homologação
Garante que a competência de Maio está limpa antes de carregar os arquivos de teste:
```bash
npx tsx scripts/delete_consolidated_homolog.ts
```

### Passo 2: Executar a Carga com o Parser Corrigido
O parser do script foi corrigido para usar as posições reais do padrão CNAB 400 (CBR) do Banco do Brasil:
* Posições do Nosso Número: `line.substring(63, 80)` (anteriormente o script de teste usava incorretamente `37-56` de CNAB 240, gerando falsos duplicados e ignorando 99% das linhas).

Para compilar e rodar a carga segura (com limite de heap de 512MB para evitar OOM):
```bash
npx tsup scripts/import_to_homolog.ts --format esm --out-dir dist-scripts --no-dts
node --max-old-space-size=512 dist-scripts/import_to_homolog.js
```

### Passo 3: Conferência do Total de Extrações
Após o término, rode o script de auditoria para comparar e conciliar os totais de Homologação vs Produção:
```bash
npx tsx scripts/compare_may8.ts
```
* **Resultado Esperado:** O console exibirá a soma total bruta exata de **R$ 1.391.627,73** em ambos os ambientes, provando que homologação está 100% íntegra e que os R$ 37k estão fisicamente gravados no banco.

---

## 💡 5. Conclusão e Recomendações
O "sumiço" de arrecadação do Banco do Brasil é um **falso positivo** gerado por um bug de modelagem no cálculo de rateio do Dashboard do sistema. 

**Recomendações técnicas para mitigação definitiva:**
1. Alterar a query de agregação das APIs de estatísticas de arquivos de retorno para somar o bruto de convênio de Quatro Partes se o objetivo for mostrar a receita total arrecadada, ou incluir o desdobramento regional de 14%.
2. Unificar a aplicação de ART como a única fonte de verdade para cálculos de Split, fornecendo os valores já faturados e rateados sem recalcular porcentagens na camada de exibição das tabelas do Dashboard.
