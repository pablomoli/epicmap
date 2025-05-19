import logging
from logging.config import fileConfig

from flask import current_app
from alembic import context
from sqlalchemy import Table

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Setup loggers
fileConfig(config.config_file_name)
logger = logging.getLogger('alembic.env')


def get_engine():
    try:
        return current_app.extensions['migrate'].db.get_engine()
    except (TypeError, AttributeError):
        return current_app.extensions['migrate'].db.engine

def get_engine_url():
    try:
        return get_engine().url.render_as_string(hide_password=False).replace('%', '%%')
    except AttributeError:
        return str(get_engine().url).replace('%', '%%')

config.set_main_option('sqlalchemy.url', get_engine_url())
target_db = current_app.extensions['migrate'].db

def get_metadata():
    if hasattr(target_db, 'metadatas'):
        return target_db.metadatas[None]
    return target_db.metadata

# 👇 Exclude PostGIS system tables from Alembic's autogenerate
def include_object(object, name, type_, reflected, compare_to):
    if type_ == "table" and name in {"spatial_ref_sys", "geometry_columns", "geography_columns", "raster_columns", "raster_overviews", "counties"}:
        return False
    return True

def run_migrations_offline():
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=get_metadata(),
        literal_binds=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    def process_revision_directives(context, revision, directives):
        if getattr(config.cmd_opts, 'autogenerate', False):
            script = directives[0]
            if script.upgrade_ops.is_empty():
                directives[:] = []
                logger.info('No changes in schema detected.')

    conf_args = current_app.extensions['migrate'].configure_args
    if conf_args.get("process_revision_directives") is None:
        conf_args["process_revision_directives"] = process_revision_directives
    conf_args["include_object"] = include_object

    connectable = get_engine()

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=get_metadata(),
            **conf_args
        )
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

