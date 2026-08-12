# TÁNDEM — Avanzamos juntos

## Seguridad de credenciales y datos sensibles

- Las contrasenas nuevas usan Argon2id. Los hashes `sha256$` se actualizan al iniciar sesion.
- `npm run security:audit-passwords` informa cantidades por formato sin mostrar hashes.
- `npm run security:migrate-plaintext-passwords -- --apply` convierte formatos directos legacy a Argon2id.
- Mensajes y reportes se cifran con AES-256-GCM usando `DATA_ENCRYPTION_KEY` (32 bytes en base64).
- `npm run security:encrypt-sensitive` cifra las filas historicas de forma idempotente.

Orden de despliegue: configurar y respaldar `DATA_ENCRYPTION_KEY`, desplegar el backend compatible y recien despues ejecutar `security:encrypt-sensitive`. La clave debe guardarse en el gestor de secretos del entorno; no se debe commitear ni perder.

<p align="center">
  Platform focused on promoting autonomy and everyday independence for people with Autism Spectrum Disorder (ASD / TEA).
</p>

---

## About The Project

TÁNDEM is an accessibility-focused platform designed to help people with Autism Spectrum Disorder develop real-life autonomy through guided routines, visual support, gamification and collaborative tools.

Unlike many existing solutions centered only around parents or professionals, TÁNDEM places the person with TEA as the primary user of the experience, encouraging independence in daily situations while still providing monitoring and support tools for families and specialists.

The project combines technology, accessibility and user-centered design to create a practical and scalable solution with real social impact.

---

## Main Features

### User Experience
- Guided daily routines
- Accessible and visual interface
- Pictogram-based support
- Structured task flows
- Personalized avatars
- Reward and points system

### Family & Tutor Tools
- Progress tracking
- Activity statistics
- Geolocation features
- Safe-zone configuration (premium)
- User monitoring dashboard

### Professional Tools
- Remote progress monitoring
- Communication with families
- Professional profile directory
- Virtual trial session support

---

## Objectives

- Promote real-world autonomy
- Reduce dependency in daily activities
- Improve routine organization
- Provide measurable progress insights
- Encourage motivation through gamification
- Build an inclusive digital experience

---

## Tech Stack

### Frontend
- React
- TypeScript
- Vite
- TailwindCSS

### Architecture & Tools
- Component-based architecture
- Responsive design
- Accessibility-first approach
- Git & GitHub workflow

---

## Project Vision

TÁNDEM is being developed as both:
- an academic project
- and a scalable real-world product idea

The long-term vision is to evolve into a platform capable of supporting families, schools and professionals through accessible technology and autonomy-focused tools.

---

## UX & Accessibility Focus

The platform is designed with special attention to:
- Cognitive accessibility
- Low-frustration interfaces
- Visual clarity
- Structured navigation
- Predictable interactions
- Reduced overstimulation

---

## Current Status

The project is currently in active development.

### Main ongoing areas
- UX/UI refinement
- User validation
- Frontend architecture
- Accessibility improvements
- Feature prototyping
- Data modeling

---

## Repository Goals

This repository showcases:
- Frontend architecture practices
- Accessibility-oriented design
- Product thinking
- Collaborative development
- Real-world problem solving

---

<p align="center">
  Built with the vision of creating technology that empowers autonomy and inclusion.
</p>
