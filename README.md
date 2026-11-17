# ♟️ Wizard Chess 3D

Интерактивные 3D-шахматы в антураже готического собора: скульптурные каменные фигуры, пространственный процедурный звук (Web Audio API), кинематографичные VFX (шоквейвы, растворение, лазерные индикаторы шаха), ИИ шести уровней, шахматные часы, Chess960 и двуязычная локализация (EN/RU).

## 🎮 Играть онлайн

**https://simaklaw.github.io/Wizard-chess-3d/**

Деплой автоматический: каждый коммит в `main` собирается Vite и публикуется на GitHub Pages (workflow `deploy.yml`).

## ✨ Возможности

- **3D-движок**: Three.js, готический собор, процедурные текстуры камня, PMREM-окружение
- **Шахматы**: полная нотация SAN, en passant, рокировки (включая Chess960), превращение пешек, история ходов с превью и отменой
- **Полные правила ничьей**: пат, 50 ходов, троекратное повторение (positionKey), недостаточный материал
- **ИИ**: negamax + альфа-бета + quiescence search, MVV-LVA ordering, PST-оценка, шесть уровней от Novice до Legend, поиск в Web Worker с бюджетом узлов
- **Режимы**: контроль времени (Bullet/Blitz/Rapid/Classical/Untimed) с шахматными часами, Chess960 (959 раскладок)
- **Звук**: 100% процедурный синтез — удары камня, хрустальные перезвоны, соборный реверб
- **Интерфейс**: React HUD, мобильное управление (тач/пинч), скрытие UI, кинематографичный тур по собору
- **Качество**: строгий type-check (tsc), unit-тесты чистого ядра (node:test, включая perft), CI + автодеплой

## 🚀 Быстрый старт

```bash
npm install
npm run dev      # http://localhost:3000
```

## 📜 Скрипты

| Команда | Описание |
|---|---|
| `npm run dev` | Дев-сервер Vite на порту 3000 |
| `npm run build` | Продакшен-сборка |
| `npm run preview` | Предпросмотр сборки |
| `npm run lint` | Проверка типов (tsc --noEmit) |
| `npm test` | Тесты (`node --test test/*.test.mjs`) |

## 🗂️ Структура проекта

```
src/
  main.tsx               — точка входа React
  App.tsx                — HUD и меню (React)
  engineBus.ts           — типизированный event bus движок ↔ UI
  wizardChessEngine.js   — игровой движок (Three.js, сцена, VFX)
  wizardChessAudio.ts    — процедурный аудиодвижок
  i18n.ts                — локализация EN/RU
  styles.css             — стили интерфейса
  chess/
    rules.js             — чистое ядро правил (ходы, SAN, FEN, perft)
    aiSearch.js          — чистый ИИ-поиск (negamax, quiescence)
    notation.js          — парсер PGN/SAN/UCI
    timeControls.js      — пресеты шахматных часов
    aiWorker.js          — Web Worker для поиска ИИ
public/assets/glb/       — 3D-модели фигур и собора
test/                    — тесты (node:test)
```

## 🛠️ Технологии

React 19 · TypeScript · Vite · Three.js · Web Audio API · node:test

## 🗺️ Roadmap

- [x] Полные правила ничьей (троекратное повторение, 50 ходов, недостаточный материал)
- [x] Рокировки в Chess960
- [x] ИИ в Web Worker + quiescence search
- [x] Автодеплой на GitHub Pages
- [ ] Выбор фигуры при превращении пешки (сейчас всегда ферзь)
- [ ] Переход на .glb + Draco (Git LFS)

## 📄 Лицензия

MIT — см. [LICENSE](LICENSE).
