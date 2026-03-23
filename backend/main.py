from fastapi import FastAPI, HTTPException, Depends
from sqlmodel import Field, SQLModel, Session, create_engine, select
from typing import Optional
from passlib.context import CryptContext
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
import uvicorn

# 1. SEGURIDAD
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__ident="2b")

# 2. MODELOS
class Mensaje(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str
    correo: str
    contenido: str

class Usuario(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    password_encriptada: str

# 3. BASE DE DATOS
sqlite_url = "sqlite:///colegio.db"
engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})

def crear_usuario_inicial():
    with Session(engine) as session:
        statement = select(Usuario).where(Usuario.username == "admin")
        if not session.exec(statement).first():
            hash_clave = pwd_context.hash("12345")
            session.add(Usuario(username="admin", password_encriptada=hash_clave))
            session.commit()
            print("✅ USUARIO 'admin' CREADO: Clave 12345")
        else:
            print("ℹ️ El usuario 'admin' ya existe.")

# 4. APP E INICIO
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SQLModel.metadata.create_all(engine)
crear_usuario_inicial()

# 5. RUTAS
@app.get("/")
def inicio():
    return {"mensaje": "Servidor IEAH Operativo"}

@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    with Session(engine) as session:
        user = session.exec(select(Usuario).where(Usuario.username == form_data.username)).first()
        if not user or not pwd_context.verify(form_data.password, user.password_encriptada):
            raise HTTPException(status_code=400, detail="Credenciales incorrectas")
        return {"status": "success", "user": user.username}

@app.post("/contacto")
def recibir_contacto(mensaje_nuevo: Mensaje):
    with Session(engine) as session:
        session.add(mensaje_nuevo)
        session.commit()
        return {"status": "success"}

@app.get("/ver-mensajes")
def ver_mensajes():
    with Session(engine) as session:
        return session.exec(select(Mensaje)).all()

@app.delete("/eliminar-mensaje/{mensaje_id}")
def eliminar_mensaje(mensaje_id: int):
    with Session(engine) as session:
        item = session.get(Mensaje, mensaje_id)
        if item:
            session.delete(item)
            session.commit()
            return {"status": "success"}
        raise HTTPException(status_code=404)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)