#!/bin/bash
# Script para sincronizar users.json antes do deploy no Vercel

set -e

echo "→ Sincronizando dados locais com armazenamento..."

# Se tem arquivo data/users.json local, vamos:
# 1. Validar o JSON
# 2. Documentar que ele será importado

if [ -f "data/users.json" ]; then
  echo "✓ Encontrado data/users.json local"
  
  # Validar JSON
  if node -e "require('./data/users.json')" 2>/dev/null; then
    echo "✓ JSON válido"
    echo ""
    echo "ℹ️  Nota importante:"
    echo "   Este arquivo será carregado automaticamente na primeira execução"
    echo "   Se estiver usando Vercel KV/Redis, os usuários serão sincronizados."
    echo "   Se estiver usando file storage, o arquivo será preservado em /tmp."
    echo ""
  else
    echo "✗ ERRO: data/users.json tem JSON inválido"
    exit 1
  fi
else
  echo "ℹ️  Nenhum data/users.json encontrado (será criado na primeira execução)"
fi

echo "→ Build pronto para deploy!"
