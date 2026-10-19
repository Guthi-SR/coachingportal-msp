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

## Datenspeicherung

Die bisherigen Spiel-, Coach-, Schiedsrichter- und PDF-Daten liegen zunächst in `localStorage` bzw. `IndexedDB` des erstellenden Browsers. Beim Aufruf von „Spiele“ oder „Beobachtungsbögen“ werden zugeordnete Inhalte über die angemeldete Admin-Sitzung in `public.portal_games` / `public.portal_observations` und den privaten Storage-Bucket `portal-observation-pdfs` kopiert. Der erste Abgleich muss im bisherigen Browser erfolgen. Alte lokale Dateien werden dabei nicht gelöscht.

Die PDF-Dokumente sind über RLS auf den Admin beschränkt. Eine vollständig browserunabhängige Personen-Stammdatenverwaltung ist eine separate spätere Aufgabe.

## Nach Veröffentlichung testen

1. Im bisher genutzten Browser anmelden. Spiele und Bögen öffnen, damit die privaten PDFs synchronisiert werden.
2. In beiden Profiltypen auf das Buch klicken. Nur der reine PDF-Bogen muss im neuen Tab erscheinen.
3. „Bogen eingegangen“ und „Bogen geprüft“ kontrollieren.
4. „Bereits versendet“ mit Datum und Notiz erproben.
5. Gelb/Rot/Grün an einem datierten Testspiel kontrollieren.
6. Bogenübersicht auf absteigende Spieltermine prüfen.
7. Nach der Mail-Konfiguration Vorschau und manuelle Erinnerungsfunktion mit einem eigenen Testdatensatz verifizieren.
8. Den Cron-Prüflauf anhand des Logs und des eingetragenen Erinnerungszeitpunkts bestätigen.

