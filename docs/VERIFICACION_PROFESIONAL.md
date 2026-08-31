# Verificación profesional

## Flujo

`DNI frontal → OCR → REFEPS público → matching → estado persistido`

El registro profesional recibe `multipart/form-data`; la imagen debe enviarse en `dni_frente`. Se procesa únicamente en memoria y no se guarda. Tesseract.js extrae nombre, apellido y DNI, pero esto no prueba la autenticidad física del documento.

La identidad declarada se compara primero con el OCR. Después se compara matrícula, nombre, apellido y DNI contra REFEPS. Solo se asigna `VERIFIED` si existe un único resultado coincidente y su `situacionMatricula` es `Habilitado`. OCR inseguro, ambigüedad o matrícula inactiva pasan a `MANUAL_REVIEW`. Un timeout, error HTTP o cambio de estructura queda registrado como `VERIFICATION_ERROR`, pero el perfil permanece en `MANUAL_REVIEW`; nunca se rechaza como falso por una falla técnica.

## Proveedor REFEPS

`RefepsPublicProvider` hace un GET al buscador para obtener cookie y `form_build_id`, y luego un POST al mismo URL con `searchBy=matricula`, `matricula`, `op=Consultar` y `form_id=argobar_consulta_refeps_profesionales`. El HTML devuelve datos JSON en `Drupal.settings.refepsProfesionales.allItems`. El proveedor encapsula ese detalle y normaliza nombre, apellido, DNI, profesión, jurisdicción, matrícula y habilitación.

Si cambia el sitio, actualizar únicamente `RefepsPublicProvider.parseHtml` y sus fixtures. Una respuesta sin la estructura conocida debe producir `STRUCTURE_MISMATCH`, nunca `NOT_FOUND`.

El proveedor implementa el contrato `buscarPorMatricula`. Un futuro cliente del WS020 oficial puede reemplazarlo mediante inyección en `ValidacionProfesionalService` sin cambiar OCR, matching, persistencia ni registro. Del mismo modo, una futura capa biométrica puede agregarse como otro proveedor coordinado por el servicio, sin acoplarla a Auth ni al OCR.

## Base de datos y pruebas

Ejecutar `npm run db:professional-verification` para agregar estados y metadatos mínimos. Ejecutar `npm run test:professional-verification` para OCR, matching, parser y coordinación deterministas.
