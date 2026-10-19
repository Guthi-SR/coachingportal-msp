# Coachingportal MSP

Internes Coachingportal: https://coachingportal-msp.vercel.app/

## Arbeitsstand vom 19.10.2026

- Schiedsrichter- und Coach-Untermenüs in der linken Navigation.
- Alle Beobachtungsbögen in einer chronologischen Übersicht (nach Spieldatum, neueste zuerst). PDF nur in separatem Fenster.
- Spiele mit Status „Bogen eingegangen“, „Bogen geprüft“, „Bogen bereits versendet“ (Datum und Notiz).
- Ampelfarben: Grün bei Versand, Gelb bis fünf Tage vor dem Spiel, Rot fünf Tage nach einem Spiel ohne Bogeneingang.
- Bei Rot manuelle E-Mail-Erinnerung an den zugeordneten Coach mit bearbeitbarem Text und Dreitagesfrist.
- Beobachtungsbogen-Versand an den Schiedsrichter mit dem zugeordneten PDF als Anhang.
- Täglicher Server-Prüflauf: an Tag fünf nach dem Spiel Erinnerung an den Portaladmin, falls kein Bogen als eingegangen markiert ist. Zwei Folgetage als Nachholfenster.
- Personenadresse und Vornamen kommen aus den vorhandenen Stammdaten im Browser und werden beim Aufrufen der Spielliste in die geschützte Portal-Datenbank übernommen.

## E-Mail-Konfiguration: STRATO SMTP

Der E-Mail-Versand erfolgt direkt über das vorhandene STRATO-Postfach `daniel.gutermuth@srgmsp.de`. Es wird keine eigene Domainverwaltung und kein Resend-Konto benötigt. Für **Production** in **Vercel → coachingportal-msp → Settings → Environment Variables** folgende drei serverseitigen Variablen setzen:

| Name | Inhalt |
| --- | --- |
| `STRATO_SMTP_USER` | `daniel.gutermuth@srgmsp.de` |
| `STRATO_SMTP_PASSWORD` | Passwort des STRATO-Mailpostfachs (ausschließlich in den geschützten Vercel-Einstellungen eintragen, nie im Chat/GitHub) |
| `SUPABASE_SERVICE_ROLE_KEY` | Geheimer Supabase-Schlüssel ausschließlich für den täglichen Admin-Prüflauf |

Für den automatischen Cron-Endpunkt muss auch `CRON_SECRET` in den Vercel-Umgebungsvariablen hinterlegt werden. Vercel legt ihn bei entsprechender Cron-Konfiguration gegebenenfalls selbst an, alternativ sicher erzeugen und serverseitig hinterlegen.

SMTP: `smtp.strato.de`, Port `465`, SSL/TLS. Der Versand erfolgt mit Nodemailer über die Vercel Serverless Functions. Ohne diese Zugangsdaten verschickt das Portal keine E-Mails. Änderungen an Umgebungsvariablen benötigen ein anschließendes neues Produktions-Deployment. Die persönliche E-Mail-Signatur wird später ergänzt.

## Sicherheit

Der SMTP-Zugang wird ausschließlich serverseitig genutzt. SMTP-Passwörter gehören **niemals** in die Website, GitHub-Dateien oder Chatnachrichten. Für Tests zunächst eine Mail an ein eigenes Testpostfach senden und nicht an einen Coach oder Schiedsrichter.

## Zentrale Datenspeicherung (Supabase)

- Spiele und Zuordnungen werden zentral in `public.portal_games` gespeichert. Neu angelegte Spiele werden unmittelbar dort geschrieben, und Änderungen an Schiedsrichter/Coach gehen direkt an Supabase.
- Schiedsrichter- und Coach-Stammdaten werden in `public.portal_people` gesichert. Listen, Profile, Auswahlfelder und Navigation laden diese Daten aus Supabase.
- Bestehende Stammdaten aus `localStorage` werden **einmalig beim Öffnen der Personenverwaltung im bisherigen Browser** nach Supabase übernommen. Alte Browserdaten bleiben als Sicherung liegen, sind aber keine führende Datenquelle mehr.
- Beobachtungsbögen und Dokumentmetadaten liegen in `public.portal_observations`, PDF-Dateien im geschützten Storage-Bucket `portal-observation-pdfs`. Einmal lokal erfasste ältere PDFs müssen im **ursprünglichen Browser** durch Öffnen der Bogenübersicht synchronisiert werden.
- Profilansichten und Bogenübersicht verwenden die zentralen Daten. Der lokale PDF-Speicher kann als zusätzlicher Fallback dienen, wenn die Datei im aktuellen Browser verfügbar ist.
- Zugriffsschutz: Authentifizierter Portal-Admin, private RLS-Richtlinien. SMTP-Geheimnisse nur in Vercel.
- **Wichtig:** Eine tatsächliche Live-Funktionsprüfung mit den konkreten Bestandsdaten ist nach dem erstmaligen Synchronisieren notwendig. Die lokale Sicherung bitte bis zu dieser Prüfung nicht löschen.

## Nach Veröffentlichung testen

1. Im bisher genutzten Browser anmelden. Spiele und Bögen öffnen, damit die privaten PDFs synchronisiert werden.
2. In beiden Profiltypen auf das Buch klicken. Nur der reine PDF-Bogen muss im neuen Tab erscheinen.
3. „Bogen eingegangen“ und „Bogen geprüft“ kontrollieren.
4. „Bereits versendet“ mit Datum und Notiz erproben.
5. Gelb/Rot/Grün an einem datierten Testspiel kontrollieren.
6. Bogenübersicht auf absteigende Spieltermine prüfen.
7. Nach der Mail-Konfiguration Vorschau und manuelle Erinnerungsfunktion mit einem eigenen Testdatensatz verifizieren.
8. Den Cron-Prüflauf anhand des Logs und des eingetragenen Erinnerungszeitpunkts bestätigen.

