import streamlit as st
import pandas as pd
from sqlalchemy import create_engine, text
import plotly.express as px
from datetime import datetime, timezone
import io

st.set_page_config(
    page_title="Dashboard OCS Inventory",
    page_icon="🖥️",
    layout="wide",
    initial_sidebar_state="expanded"
)

DB_URL = "postgresql+psycopg://fsuser:Sti%2C33784%21@192.168.200.134:5432/postgres"
engine = create_engine(DB_URL)

@st.cache_data(ttl=300)
def load_computers():
    query = """
        SELECT 
            ocs_id,
            name,
            workgroup,
            os,
            os_version,
            cpu,
            cpu_cores,
            cpu_speed_mhz,
            ram_mb,
            disk_gb,
            disk_type,
            disk_used_pct,
            disk_health,
            disk_hours_on,
            ip,
            mac,
            bios_serial,
            hardware_uuid,
            username,
            is_virtual,
            uptime_days,
            last_contact,
            last_kb_update,
            kb_count_30d,
            synced_at
        FROM sti_web.cache_ocs_computers
        ORDER BY workgroup, name
    """
    with engine.connect() as conn:
        return pd.read_sql(text(query), conn)

@st.cache_data(ttl=300)
def load_service_records():
    query = """
        SELECT 
            fsid,
            contract_no,
            subject,
            tipo_soporte,
            tipo_servicio,
            fecha,
            hora_inicio,
            hora_fin,
            horas,
            facturable,
            tecnico,
            account_id,
            createdtime,
            modifiedtime,
            tipo_uso,
            cantidad_tecnicos,
            viaje_ida_min,
            viaje_vuelta_min
        FROM sti_web.cache_fs
        ORDER BY fecha DESC
    """
    with engine.connect() as conn:
        return pd.read_sql(text(query), conn)

@st.cache_data(ttl=300)
def load_workgroups():
    with engine.connect() as conn:
        df = pd.read_sql(text("SELECT DISTINCT workgroup FROM sti_web.cache_ocs_computers ORDER BY workgroup"), conn)
    return df['workgroup'].tolist()

st.title("🖥️ Dashboard OCS Inventory")
st.markdown("---")

with st.sidebar:
    st.header("🔗 Conexión")
    st.code("Host: 192.168.200.134\nDB: postgres\nSchema: sti_web")
    st.markdown("---")

    st.header("📋 Datos disponibles por equipo")
    st.markdown("""
    | Campo | Descripción | Único |
    |---|---|---|
    | **name** | Nombre del equipo (hostname) | ✓ |
    | **is_virtual** | Físico o Virtual | ✓ |
    | **mac** | Dirección MAC | ✓✓ |
    | **bios_serial** | Serial de BIOS | ✓✓ |
    | **hardware_uuid** | UUID del hardware | ✓✓✓ |
    | **ip** | Dirección IP | ✓ |
    | **username** | Usuario del equipo | |
    | **workgroup** | Cliente/Empresa | |
    """)

    st.markdown("---")
    st.caption("Última actualización: cada 5 min")

    if st.button("🔄 Refrescar datos ahora"):
        st.cache_data.clear()
        st.rerun()

tab1, tab2, tab3, tab4 = st.tabs([
    "📊 Resumen General",
    "🖥️ Equipos",
    "🔍 Cruzar con ESET",
    "📋 Registros de Servicio"
])

with st.spinner("Cargando datos desde OCS Inventory..."):
    df = load_computers()
    df_fs = load_service_records()
    workgroups = ['TODOS'] + load_workgroups()

with tab1:
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Total Equipos", len(df))
    with col2:
        virt_count = df['is_virtual'].sum() if df['is_virtual'].notna().any() else 0
        st.metric("Máquinas Virtuales", int(virt_count))
    with col3:
        st.metric("Clientes (Workgroups)", df['workgroup'].nunique())
    with col4:
        st.metric("Registros de Servicio", len(df_fs))

    st.markdown("---")

    st.subheader("📌 Físicos vs Virtuales")
    virt_series = df['is_virtual'].map({True: 'Virtual', False: 'Físico', None: 'Desconocido'}).fillna('Desconocido')
    virt_counts = virt_series.value_counts()
    virt_pie = px.pie(
        values=virt_counts.values, names=virt_counts.index,
        hole=0.4, color=virt_counts.index,
        color_discrete_map={'Físico': '#2ecc71', 'Virtual': '#e74c3c', 'Desconocido': '#95a5a6'}
    )
    virt_pie.update_layout(height=350)
    vcol1, vcol2, vcol3 = st.columns([1, 2, 1])
    with vcol2:
        st.plotly_chart(virt_pie, use_container_width=True)

    st.markdown("---")
    col_left, col_right = st.columns(2)

    with col_left:
        st.subheader("Equipos por Sistema Operativo")
        os_counts = df['os'].value_counts().reset_index()
        os_counts.columns = ['OS', 'Cantidad']
        fig = px.bar(os_counts.head(15), x='Cantidad', y='OS',
                     orientation='h', color='Cantidad',
                     color_continuous_scale='blues')
        fig.update_layout(height=500, yaxis={'categoryorder': 'total ascending'})
        st.plotly_chart(fig, use_container_width=True)

    with col_right:
        st.subheader("Equipos por Cliente (Top 20)")
        wg_counts = df['workgroup'].value_counts().reset_index()
        wg_counts.columns = ['Cliente', 'Cantidad']
        fig2 = px.bar(wg_counts.head(20), x='Cantidad', y='Cliente',
                      orientation='h', color='Cantidad',
                      color_continuous_scale='greens')
        fig2.update_layout(height=500, yaxis={'categoryorder': 'total ascending'})
        st.plotly_chart(fig2, use_container_width=True)

    st.markdown("---")
    col_left2, col_right2 = st.columns(2)

    with col_left2:
        st.subheader("RAM Promedio por Cliente (Top 15)")
        ram_wg = df.groupby('workgroup')['ram_mb'].mean().reset_index().sort_values('ram_mb', ascending=False).head(15)
        ram_wg.columns = ['Cliente', 'RAM Promedio (MB)']
        fig3 = px.bar(ram_wg, x='RAM Promedio (MB)', y='Cliente',
                      orientation='h', color='RAM Promedio (MB)',
                      color_continuous_scale='purples')
        fig3.update_layout(height=400, yaxis={'categoryorder': 'total ascending'})
        st.plotly_chart(fig3, use_container_width=True)

    with col_right2:
        st.subheader("Discos - Estado de Salud")
        health_counts = df['disk_health'].value_counts().reset_index()
        health_counts.columns = ['Estado', 'Cantidad']
        fig4 = px.pie(health_counts, values='Cantidad', names='Estado', hole=0.4)
        fig4.update_layout(height=400)
        st.plotly_chart(fig4, use_container_width=True)

with tab2:
    wg_filter = st.selectbox("Filtrar por Cliente (Workgroup):", workgroups)

    col_filters = st.columns(4)
    with col_filters[0]:
        search_name = st.text_input("Buscar por nombre:", placeholder="Ej: PC-...")
    with col_filters[1]:
        search_ip = st.text_input("Buscar por IP:", placeholder="Ej: 192.168...")
    with col_filters[2]:
        search_user = st.text_input("Buscar por usuario:", placeholder="Ej: jperez")
    with col_filters[3]:
        show_virt = st.selectbox("Tipo:", ["TODOS", "Físicos", "Virtuales"])

    df_filtered = df.copy()
    if wg_filter != "TODOS":
        df_filtered = df_filtered[df_filtered['workgroup'] == wg_filter]
    if search_name:
        df_filtered = df_filtered[df_filtered['name'].str.contains(search_name, case=False, na=False)]
    if search_ip:
        df_filtered = df_filtered[df_filtered['ip'].str.contains(search_ip, case=False, na=False)]
    if search_user:
        df_filtered = df_filtered[df_filtered['username'].str.contains(search_user, case=False, na=False)]
    if show_virt == "Físicos":
        df_filtered = df_filtered[df_filtered['is_virtual'] == False]
    elif show_virt == "Virtuales":
        df_filtered = df_filtered[df_filtered['is_virtual'] == True]

    st.markdown(f"**Mostrando {len(df_filtered)} de {len(df)} equipos**")

    nombres_lista = sorted(df_filtered['name'].dropna().unique())
    nombres_texto = "\n".join(nombres_lista)

    copy_btn_col = st.columns([2, 1, 1, 1, 2])
    with copy_btn_col[1]:
        st.download_button(
            "📋 .txt (uno/linea)",
            nombres_texto,
            f"nombres_pc_{wg_filter}_{datetime.now().strftime('%Y%m%d')}.txt",
            "text/plain",
            use_container_width=True
        )
    with copy_btn_col[2]:
        st.download_button(
            "📋 .csv (1 columna)",
            nombres_texto,
            f"nombres_pc_{wg_filter}_{datetime.now().strftime('%Y%m%d')}.csv",
            "text/csv",
            use_container_width=True
        )
    with copy_btn_col[3]:
        st.download_button(
            "📋 .csv (fila)",
            ",".join(nombres_lista),
            f"nombres_pc_{wg_filter}_{datetime.now().strftime('%Y%m%d')}_fila.csv",
            "text/csv",
            use_container_width=True
        )

    with st.expander("👁️ Vista previa de nombres", expanded=False):
        st.code(nombres_texto, language="text")

    display_cols = {
        'name': 'Nombre',
        'workgroup': 'Cliente',
        'os': 'Sistema Operativo',
        'cpu': 'CPU',
        'ram_mb': 'RAM (MB)',
        'disk_gb': 'Disco (GB)',
        'disk_type': 'Tipo Disco',
        'disk_used_pct': 'Uso %',
        'disk_health': 'Salud Disco',
        'ip': 'IP',
        'mac': 'MAC',
        'bios_serial': 'Serial BIOS',
        'hardware_uuid': 'UUID Hardware',
        'username': 'Usuario',
        'is_virtual': 'Virtual',
        'uptime_days': 'Uptime (días)',
        'last_contact': 'Último Contacto'
    }

    df_show = df_filtered[list(display_cols.keys())].copy()
    df_show.columns = list(display_cols.values())
    df_show['Virtual'] = df_show['Virtual'].map({
        True: '🟥 Virtual',
        False: '🟩 Físico',
        None: '⬜ Desconocido'
    })
    df_show['Último Contacto'] = pd.to_datetime(df_show['Último Contacto']).dt.strftime('%Y-%m-%d %H:%M')

    st.dataframe(
        df_show,
        use_container_width=True,
        height=600,
        column_config={
            "RAM (MB)": st.column_config.NumberColumn(format="%d MB"),
            "Disco (GB)": st.column_config.NumberColumn(format="%d GB"),
            "Uso %": st.column_config.NumberColumn(format="%d%%"),
        }
    )

    col_export = st.columns([1, 1, 5])
    with col_export[0]:
        csv = df_show.to_csv(index=False).encode('utf-8-sig')
        st.download_button(
            "📥 Descargar CSV",
            csv,
            f"ocs_equipos_{datetime.now().strftime('%Y%m%d_%H%M')}.csv",
            "text/csv",
            use_container_width=True
        )
    with col_export[1]:
        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
            df_show.to_excel(writer, index=False, sheet_name='Equipos')
        st.download_button(
            "📥 Descargar Excel",
            buffer.getvalue(),
            f"ocs_equipos_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True
        )

with tab3:
    st.header("🔍 Datos Únicos para Cruzar con ESET Protect")

    st.markdown("""
    Esta sección muestra los **identificadores únicos** de cada equipo que puedes usar para
    cruzar con los datos obtenidos desde la **API de ESET Protect**.

    ### 📌 Campos clave para el cruce:
    """)

    col_cross = st.columns(2)
    with col_cross[0]:
        st.markdown("""
        | Campo | Tipo | Fiabilidad |
        |---|---|---|
        | **hardware_uuid** | UUID único del motherboard | ★★★★★ |
        | **bios_serial** | Serial de BIOS | ★★★★★ |
        | **mac** | Dirección MAC | ★★★★☆ |
        | **name** | Hostname del equipo | ★★★☆☆ |
        | **ip** | Dirección IP (puede cambiar) | ★★☆☆☆ |
        """)
    with col_cross[1]:
        st.info("""
        **💡 Recomendación:**
        Usa `bios_serial` o `hardware_uuid` como llave principal
        y `name` + `mac` como respaldo para el cruce.
        """)

    st.markdown("---")
    st.subheader("Vista para cruce de datos")

    cross_wg = st.selectbox("Filtrar por cliente:", workgroups, key="cross_wg")

    cross_df = df.copy()
    if cross_wg != "TODOS":
        cross_df = cross_df[cross_df['workgroup'] == cross_wg]

    cross_show = cross_df[[
        'name', 'workgroup', 'is_virtual', 'bios_serial', 'hardware_uuid', 'mac', 'ip', 'username', 'os'
    ]].copy()
    cross_show['is_virtual'] = cross_show['is_virtual'].map({True: '🖥️ Virtual', False: '🖥️ Físico', None: '❓ Desconocido'})
    cross_show.columns = [
        'Nombre PC', 'Cliente', 'Tipo', 'Serial BIOS', 'UUID Hardware',
        'MAC', 'IP', 'Usuario', 'Sistema Operativo'
    ]

    st.dataframe(cross_show, use_container_width=True, height=500)

    cross_nombres = sorted(cross_df['name'].dropna().unique())
    ccol = st.columns([3, 1, 1, 3])
    with ccol[1]:
        st.download_button(
            "📋 Copiar nombres (.txt)",
            "\n".join(cross_nombres),
            f"nombres_{cross_wg}_{datetime.now().strftime('%Y%m%d')}.txt",
            "text/plain",
            use_container_width=True
        )
    with ccol[2]:
        st.download_button(
            "📋 Copiar nombres (.csv)",
            "\n".join(cross_nombres),
            f"nombres_{cross_wg}_{datetime.now().strftime('%Y%m%d')}.csv",
            "text/csv",
            use_container_width=True
        )

    col_exp = st.columns(2)
    with col_exp[0]:
        csv_cross = cross_show.to_csv(index=False).encode('utf-8-sig')
        st.download_button(
            "📥 Descargar para cruce (CSV)",
            csv_cross,
            f"cruce_eset_{cross_wg}_{datetime.now().strftime('%Y%m%d_%H%M')}.csv",
            "text/csv",
            use_container_width=True
        )
    with col_exp[1]:
        buffer2 = io.BytesIO()
        with pd.ExcelWriter(buffer2, engine='openpyxl') as writer:
            cross_show.to_excel(writer, index=False, sheet_name='Cruce_ESET')
        st.download_button(
            "📥 Descargar para cruce (Excel)",
            buffer2.getvalue(),
            f"cruce_eset_{cross_wg}_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True
        )

    st.markdown("---")
    st.subheader("📊 Verificación rápida")
    st.markdown("Computadoras que **NO** tienen datos de BIOS Serial o UUID (difícil cruce):")

    missing_bios = cross_df[cross_df['bios_serial'].isna() | (cross_df['bios_serial'] == '')]
    missing_uuid = cross_df[cross_df['hardware_uuid'].isna() | (cross_df['hardware_uuid'] == '')]

    col_miss = st.columns(2)
    with col_miss[0]:
        st.metric("Sin BIOS Serial", len(missing_bios))
    with col_miss[1]:
        st.metric("Sin UUID Hardware", len(missing_uuid))

    if len(missing_bios) > 0:
        with st.expander(f"Ver {len(missing_bios)} equipos sin BIOS Serial"):
            st.dataframe(missing_bios[['name', 'workgroup', 'ip', 'mac']], use_container_width=True)

    if len(missing_uuid) > 0:
        with st.expander(f"Ver {len(missing_uuid)} equipos sin UUID Hardware"):
            st.dataframe(missing_uuid[['name', 'workgroup', 'ip', 'mac']], use_container_width=True)

with tab4:
    st.header("📋 Registros de Servicio (Field Service)")

    fs_col1, fs_col2 = st.columns(2)
    with fs_col1:
        fs_search = st.text_input("Buscar por contrato o cliente:", placeholder="Ej: FS-... o nombre")
    with fs_col2:
        fs_tecnico = st.text_input("Filtrar por técnico:", placeholder="Ej: nombre del técnico")

    fs_filtered = df_fs.copy()
    if fs_search:
        fs_filtered = fs_filtered[
            fs_filtered['contract_no'].str.contains(fs_search, case=False, na=False) |
            fs_filtered['subject'].str.contains(fs_search, case=False, na=False)
        ]
    if fs_tecnico:
        fs_filtered = fs_filtered[fs_filtered['tecnico'].str.contains(fs_tecnico, case=False, na=False)]

    st.markdown(f"**Mostrando {len(fs_filtered)} de {len(df_fs)} registros**")

    fs_display = fs_filtered.rename(columns={
        'fsid': 'ID',
        'contract_no': 'Contrato',
        'subject': 'Asunto',
        'tipo_soporte': 'Tipo Soporte',
        'tipo_servicio': 'Tipo Servicio',
        'fecha': 'Fecha',
        'hora_inicio': 'Inicio',
        'hora_fin': 'Fin',
        'horas': 'Horas',
        'facturable': 'Facturable',
        'tecnico': 'Técnico',
        'account_id': 'Account ID',
        'tipo_uso': 'Tipo Uso',
        'cantidad_tecnicos': 'Cant. Técnicos'
    })[['ID', 'Contrato', 'Asunto', 'Tipo Soporte', 'Fecha', 'Técnico', 'Horas', 'Tipo Uso', 'Account ID']]

    st.dataframe(fs_display, use_container_width=True, height=500)

    csv_fs = fs_display.to_csv(index=False).encode('utf-8-sig')
    st.download_button(
        "📥 Descargar registros (CSV)",
        csv_fs,
        f"ocs_servicios_{datetime.now().strftime('%Y%m%d_%H%M')}.csv",
        "text/csv",
        use_container_width=True
    )

st.markdown("---")
st.caption(f"Dashboard OCS Inventory | Actualizado: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')} | Total equipos: {len(df)} | Total clientes: {df['workgroup'].nunique()}")
