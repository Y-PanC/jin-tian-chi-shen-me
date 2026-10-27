from alembic import context
from sqlalchemy import create_engine
from backend.models import Base
from backend.config import Settings

config = context.config
target_metadata = Base.metadata

if context.is_offline_mode():
    context.configure(url=Settings.from_env().database_url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    connection = config.attributes.get("connection")
    if connection is not None:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()
    else:
        engine = create_engine(Settings.from_env().database_url)
        with engine.connect() as conn:
            context.configure(connection=conn, target_metadata=target_metadata, compare_type=True)
            with context.begin_transaction():
                context.run_migrations()
