# Versão nativa (Capacitor) + Widgets

Este projeto está preparado para correr como **app nativa** Android e iOS via Capacitor, com **hot-reload** da preview Lovable enquanto desenvolves.

> A Lovable não compila apps nativas. Os passos abaixo correm **no teu Mac/PC**.

## 1. Setup local

1. No editor Lovable: **GitHub → Export to GitHub** (botão no canto superior direito).
2. No teu PC:
   ```bash
   git clone <o-teu-repo>
   cd <o-teu-repo>
   npm install
   ```
3. Adicionar as plataformas:
   ```bash
   npx cap add ios
   npx cap add android
   ```
4. Build da app web e sync para os projetos nativos:
   ```bash
   npm run build
   npx cap sync
   ```
5. Abrir nos IDEs:
   ```bash
   npx cap open ios        # precisa Xcode + macOS
   npx cap open android    # precisa Android Studio
   ```

## 2. Hot-reload da preview Lovable

Em `capacitor.config.ts` o bloco `server.url` aponta para a tua preview. Enquanto está ativo, a app nativa carrega o frontend da Lovable em tempo real — alteras na Lovable, fazes pull-to-refresh no telemóvel e vê logo.

Para produção (publicar na Play Store / App Store): **comenta o bloco `server` inteiro**, depois `npm run build && npx cap sync`.

## 3. Sempre que mudares código na Lovable

```bash
git pull
npm install   # se houve mudanças no package.json
npx cap sync
```

---

# Widgets nativos no ecrã principal

Capacitor **não inclui widgets** — são funcionalidade puramente nativa (WidgetKit no iOS, App Widgets no Android). Tens de adicionar código Swift/Kotlin **diretamente nos projetos `ios/` e `android/`**.

A estratégia é:
- A app Lovable escreve o estado do cronómetro (categoria, início, lembretes) em armazenamento partilhado usando `@capacitor/preferences`.
- O widget nativo lê esse armazenamento e mostra a contagem.

## Partilhar dados da app ↔ widget

A web já pode escrever em `Preferences`:

```ts
import { Preferences } from "@capacitor/preferences";

await Preferences.set({
  key: "active_timer",
  value: JSON.stringify({
    categoryName: "Trabalho",
    categoryColor: "#ff7a18",
    startedAt: Date.now(),
  }),
});
```

No iOS o widget precisa de ler do **App Group** partilhado; no Android lê das **SharedPreferences** com o mesmo nome.

## Android Widget (resumo)

1. No Android Studio: **File → New → Widget → App Widget**. Nome: `TimerWidget`.
2. Edita `android/app/src/main/java/.../TimerWidgetProvider.kt`:
   ```kotlin
   class TimerWidgetProvider : AppWidgetProvider() {
     override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
       val prefs = ctx.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
       val json = prefs.getString("active_timer", null)
       val views = RemoteViews(ctx.packageName, R.layout.timer_widget)
       if (json != null) {
         val obj = JSONObject(json)
         val started = obj.getLong("startedAt")
         val elapsed = (System.currentTimeMillis() - started) / 1000
         views.setTextViewText(R.id.widget_category, obj.getString("categoryName"))
         views.setChronometer(R.id.widget_timer, SystemClock.elapsedRealtime() - (System.currentTimeMillis() - started), null, true)
       } else {
         views.setTextViewText(R.id.widget_category, "Sem sessão")
       }
       ids.forEach { mgr.updateAppWidget(it, views) }
     }
   }
   ```
3. Layout `res/layout/timer_widget.xml` com um `TextView` e `Chronometer`.
4. Manifest já é gerado pelo wizard.

## iOS Widget (resumo)

1. No Xcode: **File → New → Target → Widget Extension**. Nome: `TimerWidget`. **Desliga** "Include Configuration Intent".
2. Cria um **App Group** (Capabilities → App Groups → `group.app.lovable.cronometro`) **em ambos** os targets (app e widget).
3. No `capacitor.config.ts`, configura o plugin Preferences para usar esse grupo:
   ```ts
   plugins: {
     Preferences: { group: "group.app.lovable.cronometro" }
   }
   ```
4. `TimerWidget.swift`:
   ```swift
   import WidgetKit
   import SwiftUI

   struct TimerEntry: TimelineEntry {
     let date: Date
     let categoryName: String
     let startedAt: Date?
   }

   struct Provider: TimelineProvider {
     func placeholder(in: Context) -> TimerEntry {
       TimerEntry(date: .now, categoryName: "Cronómetro", startedAt: nil)
     }
     func getSnapshot(in c: Context, completion: @escaping (TimerEntry) -> Void) {
       completion(load())
     }
     func getTimeline(in c: Context, completion: @escaping (Timeline<TimerEntry>) -> Void) {
       completion(Timeline(entries: [load()], policy: .after(.now.addingTimeInterval(60))))
     }
     func load() -> TimerEntry {
       let d = UserDefaults(suiteName: "group.app.lovable.cronometro")
       guard let raw = d?.string(forKey: "active_timer"),
             let data = raw.data(using: .utf8),
             let obj = try? JSONSerialization.jsonObject(with: data) as? [String:Any],
             let name = obj["categoryName"] as? String,
             let ms = obj["startedAt"] as? Double
       else { return TimerEntry(date: .now, categoryName: "Sem sessão", startedAt: nil) }
       return TimerEntry(date: .now, categoryName: name, startedAt: Date(timeIntervalSince1970: ms/1000))
     }
   }

   struct TimerWidgetView: View {
     let entry: TimerEntry
     var body: some View {
       VStack(alignment: .leading) {
         Text(entry.categoryName).font(.caption).bold()
         if let s = entry.startedAt {
           Text(s, style: .timer).font(.title2).monospacedDigit()
         } else {
           Text("—").font(.title2)
         }
       }.padding()
     }
   }

   @main struct TimerWidget: Widget {
     var body: some WidgetConfiguration {
       StaticConfiguration(kind: "TimerWidget", provider: Provider()) { e in
         TimerWidgetView(entry: e)
       }
       .configurationDisplayName("Cronómetro")
       .supportedFamilies([.systemSmall, .systemMedium])
     }
   }
   ```
5. Sempre que o widget precisa de atualizar (ex.: parar timer), chama do lado web:
   ```ts
   // depois de escrever em Preferences
   // (precisa de um pequeno plugin custom para chamar WidgetCenter.shared.reloadAllTimelines())
   ```

## Notas

- Widgets não correm JavaScript — são puramente nativos. A app web continua a ser a interface principal; o widget é só uma "janela" para o estado guardado.
- Para o widget refletir cada segundo no iOS usa `Text(date, style: .timer)` (renderiza sem precisar de timeline updates).
- No Android o `Chronometer` faz a mesma coisa.

Se precisares de notificações push verdadeiras a nível de SO (com a app fechada), instala `@capacitor/push-notifications` e liga ao Firebase — já tens infraestrutura FCM neste projeto.
