# Testar Barramento — V.tal

Site estático (`index.html`) publicado na Vercel a cada push na `main`. Banco de dados: Supabase.

## Banco de dados (uma vez)
1. Supabase → SQL Editor → New query → cole `supabase/schema.sql` → Run.
2. Supabase → Project Settings → API → copie a **Project URL** e a chave **anon / publishable** (nunca a `service_role`).
3. No `index.html`, já preenchido com o projeto `edrnecnhjmbictlacoav` (mesmo do Painel de Indicadores).

## Funções
- **Registrar teste:** ao final de cada teste o app pergunta se deseja registrar. Fica salvo com data/hora, visível para todos no histórico do trecho e no botão HISTÓRICO, com comparação "melhor / pior" contra o registro anterior.
- **Novos barramentos (ADICIONAR):** a planilha enviada é gravada no banco e aparece para todos os usuários.
- Acesso aberto, sem login. O histórico de testes não pode ser editado nem apagado pelo app.

## Curvas anexadas aos testes
Na base histórica cada teste registrado tem o botão **Anexar curva** (aceita vários arquivos, até 25 MB cada). Testes com arquivo ganham a flag **CURVAS** e o botão **Baixar**. Requer rodar o bloco 4 do `supabase/schema.sql` (tabela `tb_curvas` + bucket `curvas`).
