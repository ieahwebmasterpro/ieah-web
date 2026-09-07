document.getElementById('formContacto').addEventListener('submit', async (e) => {
    e.preventDefault();

    const datos = {
        nombre: document.getElementById('nombre').value,
        correo: document.getElementById('correo').value,
        contenido: document.getElementById('mensaje').value
    };

    try {
        const response = await fetch('https://ieah-backend.onrender.com/contacto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        if (response.ok) {
            alert("✅ ¡Éxito! Tu mensaje ha sido enviado a la institución.");
            document.getElementById('formContacto').reset(); // Limpia el formulario
        } else {
            alert("❌ Hubo un error al enviar el mensaje. Intenta más tarde.");
        }
    } catch (error) {
        alert("📡 No se pudo conectar con el servidor. Verifica que el backend esté encendido.");
    }
});