# Documentação: Tela Operacional (Painel)

A tela **Operacional (Painel)** é o coração do sistema, projetada para uso contínuo durante a jornada de trabalho. Ela permite registrar atividades, acompanhar o tempo gasto (direto ou indireto) e visualizar métricas de desempenho em tempo real.

O painel é dividido em três áreas principais:

---

## 1. Métricas de Desempenho da Sessão
Localizada no topo da tela, esta seção fornece um resumo rápido e em tempo real da produtividade da sessão atual (com base nos registos filtrados):
- **Horas Diretas:** Tempo acumulado em atividades produtivas (ex: reposição, processamento de elog).
- **Horas Indiretas:** Tempo acumulado em pausas, reuniões ou atividades que não geram volume físico.
- **Total Volumes:** A soma de todas as unidades trabalhadas/movimentadas.
- **VPH Direto (Net):** Cálculo de Volumes Por Hora considerando apenas o tempo em *Atividades Diretas*. É o principal indicador de velocidade real.
- **VPH Geral (Bruto):** Cálculo de Volumes Por Hora diluído por todo o tempo de trabalho (Direto + Indireto).

## 2. Registo de Atividade (Cronômetro)
Esta é a ferramenta principal do operador para mensurar o tempo de trabalho.

### Configurações Iniciais
Antes de iniciar um cronômetro, é necessário:
- **Definir o Operador:** Escolher o nome do colaborador ativo no campo de seleção (que guarda um histórico de nomes já utilizados).
- **Configurar a API Sheets:** Fornecer o link da planilha (Google Apps Script Web App URL) para onde os dados serão enviados na nuvem.

### Uso do Cronômetro
- **Atividades Diretas:** Botões rápidos (`REPRO`, `ELOG`, `DIV`) que iniciam a contagem de tempo imediatamente como trabalho focado/direto.
- **Atividades Indiretas:** Um menu suspenso para escolher o tipo de pausa ou tarefa secundária (ex: Treinamentos, Reuniões, Inventário), seguido de um botão `INICIAR`.
- **Controles (Pausar / Finalizar):**
  - O botão `PAUSAR` suspende a contagem temporariamente (o status muda para PAUSADO).
  - O botão `FINALIZAR` encerra o cronômetro e abre o formulário de finalização.

### Formulário de Finalização
Quando uma **Atividade Direta** é finalizada, um sub-painel é exibido pedindo a **QTD Volumes** processados durante aquele tempo.
- O sistema calcula e exibe ao lado uma **Projeção de VOL/H** baseada no tempo cronometrado e na quantidade inserida, permitindo ao operador ter um *feedback* instantâneo antes mesmo de gravar.
- Para **Atividades Indiretas**, o preenchimento de volumes não é solicitado (é assumido como 0).
- Clicar em `GRAVAR` salva o registo na base de dados local; `CANCELAR` descarta a medição atual.

---

## 3. Status da Base (Sincronização e Backend)
Localizado na barra lateral direita, este painel gerencia a persistência dos dados:
- **Motor DB:** Indica a tecnologia usada no armazenamento local (`IndexedDB`), garantindo funcionamento mesmo *offline*.
- **Registos Totais:** Total de entradas guardadas localmente.
- **Sincronizados:** Quantidade de entradas já validadas e enviadas para o servidor.
- **Fila Retida:** Entradas pendentes de envio. Fica piscando em cor de alerta quando há dados esperando conexão.
- **Ações:** O botão `Sincronizar Fila` tenta forçar o envio dos dados pendentes para o Google Sheets / PostgreSQL através da API configurada, lidando com retenção *offline* através de um mecanismo de repetição (*retry*).

